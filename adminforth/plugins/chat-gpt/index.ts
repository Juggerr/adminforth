
import { IAdminForth, IHttpServer, AdminForthPlugin, AdminForthResource, AdminForthDataTypes  } from "adminforth";
import { PluginOptions } from './types.js';


export default class ChatGptPlugin extends AdminForthPlugin {
  options: PluginOptions;

  resourceConfig!: AdminForthResource;

  columnType!: AdminForthDataTypes;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    return `${pluginOptions.fieldName}`;
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);
    this.resourceConfig = resourceConfig;

    if (!this.options.openAiApiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    
    // ensure that column exists
    const column = this.resourceConfig.columns.find(f => f.name === this.options.fieldName);
    if (!column) {
      throw new Error(`Field ${this.options.fieldName} not found in resource ${this.resourceConfig.label}`);
    }

    if (!column.components) {
      column.components = {};
    }
    const filed = {
      file: this.componentPath('completionInput.vue'),
      meta: {
        pluginInstanceId: this.pluginInstanceId,
        fieldName: this.options.fieldName,
        debounceTime: this.options.expert?.debounceTime || 300,
      }
    }
    column.components.create = filed;
    column.components.edit = filed;

    this.columnType = column.type!;
  }
 
  validateConfigAfterDiscover(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    const column = this.resourceConfig.columns.find(f => f.name === this.options.fieldName);
    if (![AdminForthDataTypes.STRING, AdminForthDataTypes.TEXT].includes(column!.type!)) {
      throw new Error(`Field ${this.options.fieldName} should be string or text type, but it is ${column!.type}`);
    }
  }

  generateRecordContext(record: any, maxFields: number, inputFieldLimit: number, partsCount: number): string {
    // stringify each field
    let fields: [string, string][] = Object.entries(record).map(([key, value]) => {
      return [key, JSON.stringify(value)];
    });

    // sort fields by length, higher first
    fields = fields.sort((a, b) => b[1].length - a[1].length);

    // select longest maxFields fields
    fields = fields.slice(0, maxFields);

    const minLimit = '...'.length * partsCount;

    if (inputFieldLimit < minLimit) {
      throw new Error(`inputFieldLimit should be at least ${minLimit}`);
    }

    // for each field, if it is longer than inputFieldLimit, truncate it using next way:
    // split into 5 parts, divide inputFieldLimit by 5, crop each part to this length, join parts using '...'
    fields = fields.map(([key, value]) => {
      if (value.length > inputFieldLimit) {
        const partLength = Math.floor(inputFieldLimit / partsCount) - '...'.length;
        const parts = [];
        for (let i = 0; i < partsCount; i++) {
          parts.push(value.slice(i * partLength, (i + 1) * partLength));
        }
        value = parts.join('...');
        return [key, value];
      }
      return [key, value];
    });

    return JSON.stringify(Object.fromEntries(fields));
  }

  setupEndpoints(server: IHttpServer) {
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/doComplete`,
      handler: async ({ body }) => {
        const { record } = body;
        const recordNoField = {...record};
        delete recordNoField[this.options.fieldName];
        let currentVal = record[this.options.fieldName];
        const promptLimit = this.options.expert?.promptInputLimit || 500;
        const inputContext = this.generateRecordContext(
          recordNoField,
          this.options.expert?.recordContext?.maxFields || 5, 
          this.options.expert?.recordContext?.maxFieldLength || 300,
          this.options.expert?.recordContext?.splitParts || 5,
        );

        if (currentVal && currentVal.length > promptLimit) {
          currentVal = currentVal.slice(-promptLimit);
        }

        const resLabel = this.resourceConfig.label;
       
        let content;
        
        if (currentVal) {
          content = `Continue writing for text/string field "${this.options.fieldName}" in the table "${resLabel}"\n` +
              (Object.keys(recordNoField).length > 0 ? `Record has values for the context: ${inputContext}\n` : '') +
              `Current field value: ${currentVal}\n` +
              "Don't talk to me. Just write text. No quotes. Don't repeat current field value, just write completion\n";

        } else {
          content = `Fill text/string field "${this.options.fieldName}" in the table "${resLabel}"\n` +
              (Object.keys(recordNoField).length > 0 ? `Record has values for the context: ${inputContext}\n` : '') +
              "Be short, clear and precise. No quotes. Don't talk to me. Just write text\n";
        }

        process.env.HEAVY_DEBUG && console.log('🪲 OpenAI Prompt 🧠', content);
        const stop = this.options.expert?.stop || ['.'];
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.options.openAiApiKey}`
          },
          body: JSON.stringify({
            model: this.options.model || 'gpt-4o-mini',
            messages: [
              {
                role: 'user', 
                content,
              }
            ],
            temperature: this.options.expert?.temperature || 0.7,
            max_tokens: this.options.expert?.maxTokens || 50,
            stop,
          })
        });
        const data = await resp.json();
        let suggestion = data.choices[0].message.content + (
          data.choices[0].finish_reason === 'stop' ? (
            stop[0] === '.' && stop.length === 1 && this.columnType === AdminForthDataTypes.TEXT ? '. ' : ''
          ) : ''
        );

        if (suggestion.startsWith(currentVal)) {
          suggestion = suggestion.slice(currentVal.length);
        }
        const wordsList = suggestion.split(' ').map((w, i) => {
          return (i === suggestion.split(' ').length - 1) ? w : w + ' ';
        });

        // remove quotes from start and end
        return {
          completion: wordsList
        };
      }
    });
  }

}
