
import AdminForthAuth from './auth.js';
import MongoConnector from './dataConnectors/mongo.js';
import PostgresConnector from './dataConnectors/postgres.js';
import SQLiteConnector from './dataConnectors/sqlite.js';
import CodeInjector from './modules/codeInjector.js';
import ExpressServer from './servers/express.js';
import { ADMINFORTH_VERSION, listify, suggestIfTypo } from './modules/utils.js';
import { 
  type AdminForthConfig, 
  type IAdminForth, 
  type IConfigValidator,
  IOperationalResource,
  AdminForthFilterOperators,
  AdminForthDataTypes, AdminForthResourcePages, IHttpServer, 
  BeforeSaveFunction,
  AfterSaveFunction,
  AdminUser,
  AdminForthResource,
} from './types/AdminForthConfig.js';
import AdminForthPlugin from './basePlugin.js';
import ConfigValidator from './modules/configValidator.js';
import AdminForthRestAPI, { interpretResource } from './modules/restApi.js';
import ClickhouseConnector from './dataConnectors/clickhouse.js';
import OperationalResource from './modules/operationalResource.js';
import { error } from 'console';

// exports
export * from './types/AdminForthConfig.js'; 
export { interpretResource };
export { AdminForthPlugin };
export { suggestIfTypo };


class AdminForth implements IAdminForth {
  static Types = AdminForthDataTypes;

  static Utils = {
    generatePasswordHash: async (password) => {
      return await AdminForthAuth.generatePasswordHash(password);
    }
  }

  #defaultConfig = {
    deleteConfirmation: true,
  }

  config: AdminForthConfig;
  express: ExpressServer;
  auth: AdminForthAuth;
  codeInjector: CodeInjector;
  connectors;
  connectorClasses: any;
  runningHotReload: boolean;
  activatedPlugins: Array<AdminForthPlugin>;
  configValidator: IConfigValidator;
  restApi: AdminForthRestAPI;
  operationalResources: {
    [resourceId: string]: IOperationalResource,
  }
  baseUrlSlashed: string;

  statuses: {
    dbDiscover: 'running' | 'done',
  }

  constructor(config: AdminForthConfig) {
    this.config = {...this.#defaultConfig,...config};
    this.codeInjector = new CodeInjector(this);
    this.configValidator = new ConfigValidator(this, this.config);
    this.restApi = new AdminForthRestAPI(this);
    this.activatedPlugins = [];
    
    this.configValidator.validateConfig();
    this.activatePlugins();
    this.configValidator.validateConfig();   // revalidate after plugins

    this.express = new ExpressServer(this);
    this.auth = new AdminForthAuth(this);
    this.connectors = {};
    this.statuses = {
      dbDiscover: 'running',
    };

    console.log(`🚀 AdminForth v${ADMINFORTH_VERSION} starting up`)
  }

  activatePlugins() {
    process.env.HEAVY_DEBUG && console.log('🔌🔌🔌 Activating plugins');
    const allPluginInstances = [];
    for (let resource of this.config.resources) {
      for (let pluginInstance of resource.plugins || []) {
        allPluginInstances.push({pi: pluginInstance, resource});
      }
    }
    allPluginInstances.sort(({pi: a}, {pi: b}) => a.activationOrder - b.activationOrder);
    allPluginInstances.forEach(
      ({pi: pluginInstance, resource}) => {
        pluginInstance.modifyResourceConfig(this, resource);
        const plugin = this.activatedPlugins.find((p) => p.pluginInstanceId === pluginInstance.pluginInstanceId);
        if (plugin) {
          process.env.HEAVY_DEBUG && console.log(`Current plugin pluginInstance.pluginInstanceId ${pluginInstance.pluginInstanceId}`);
          
          throw new Error(`Attempt to activate Plugin ${pluginInstance.constructor.name} second time for same resource, but plugin does not support it. 
            To support multiple plugin instance pre one resource, plugin should return unique string values for each installation from instanceUniqueRepresentation`);
        }
        this.activatedPlugins.push(pluginInstance);
      }
    );
  }

  async discoverDatabases() {
    this.statuses.dbDiscover = 'running';
    this.connectorClasses = {
      'sqlite': SQLiteConnector,
      'postgres': PostgresConnector,
      'mongodb': MongoConnector,
      'clickhouse': ClickhouseConnector,
    };
    if (!this.config.databaseConnectors) {
      this.config.databaseConnectors = {...this.connectorClasses};
    }
    this.config.dataSources.forEach((ds) => {
      const dbType = ds.url.split(':')[0];
      if (!this.config.databaseConnectors[dbType]) {
        throw new Error(`Database type '${dbType}' is not supported, consider using one of ${Object.keys(this.connectorClasses).join(', ')} or create your own data-source connector`);
      }
      this.connectors[ds.id] = new this.config.databaseConnectors[dbType]({url: ds.url});  
    });

    await Promise.all(this.config.resources.map(async (res) => {
      if (!this.connectors[res.dataSource]) {
        const similar = suggestIfTypo(Object.keys(this.connectors), res.dataSource);
        throw new Error(`Resource '${res.table}' refers to unknown dataSource '${res.dataSource}' ${similar 
          ? `. Did you mean '${similar}'?` : 'Available dataSources: '+Object.keys(this.connectors).join(', ')}`
        );
      }
      const fieldTypes = await this.connectors[res.dataSource].discoverFields(res);
      if (fieldTypes !== null && !Object.keys(fieldTypes).length) {
        throw new Error(`Table '${res.table}' (In resource '${res.resourceId}') has no fields or does not exist`);
      }
      if (fieldTypes === null) {
        console.error(`⛔ DataSource ${res.dataSource} was not able to perform field discovery. It will not work properly`);
        return;
      }
      if (!res.columns) {
        res.columns = Object.keys(fieldTypes).map((name) => ({ name }));
      }

      res.columns.forEach((col, i) => {
        if (!fieldTypes[col.name] && !col.virtual) {
          const similar = suggestIfTypo(Object.keys(fieldTypes), col.name);
          throw new Error(`Resource '${res.table}' has no column '${col.name}'. ${similar ? `Did you mean '${similar}'?` : ''}`);
        }
        // first find discovered values, but allow override
        res.columns[i] = { ...fieldTypes[col.name], ...col };
      });

      this.configValidator.postProcessAfterDiscover(res);

      // check if primaryKey column is present
      if (!res.columns.some((col) => col.primaryKey)) {
        throw new Error(`Resource '${res.table}' has no column defined or auto-discovered. Please set 'primaryKey: true' in a columns which has unique value for each record and index`);
      }

    }));

    this.statuses.dbDiscover = 'done';

    this.operationalResources = {};
    this.config.resources.forEach((resource) => {
      this.operationalResources[resource.resourceId] = new OperationalResource(this.connectors[resource.dataSource], resource);
    });

    // console.log('⚙️⚙️⚙️ Database discovery done', JSON.stringify(this.config.resources, null, 2));
  }

  async bundleNow({ hotReload=false }) {
    await this.codeInjector.bundleNow({ hotReload });
  }

  async getUserByPk(pk: string) {
    const resource = this.config.resources.find((res) => res.resourceId === this.config.auth.usersResourceId);
    if (!resource) {
      const similar = suggestIfTypo(this.config.resources.map((res) => res.resourceId), this.config.auth.usersResourceId);
      throw new Error(`No resource with  ${this.config.auth.usersResourceId} found. ${similar ? 
        `Did you mean '${similar}' in config.auth.usersResourceId?` : 'Please set correct resource in config.auth.usersResourceId'}`
      );
    }
    const users = await this.connectors[resource.dataSource].getData({
      resource,
      filters: [
        { field: resource.columns.find((col) => col.primaryKey).name, operator: AdminForthFilterOperators.EQ, value: pk },
      ],
      limit: 1,
      offset: 0,
      sort: [],
    });
    return users.data[0] || null;
  }

  async createResourceRecord(
    { resource, record, adminUser }: 
    { resource: AdminForthResource, record: any, adminUser: AdminUser }
  ): Promise<{ ok: boolean, error?: string, createdRecord?: any }> {
    
    for (const column of resource.columns) {
      // TODO: assuming specifity for AdminForthResourcePages.create better to move it to api for this button
      if (
          (column.required as {create?: boolean, edit?: boolean}) ?.create &&
          record[column.name] === undefined &&
          column.showIn.includes(AdminForthResourcePages.create)
      ) {
          return { error: `Column '${column.name}' is required`, ok: false };
      }
    }

    // execute hook if needed
    for (const hook of listify(resource.hooks?.create?.beforeSave as BeforeSaveFunction[])) {
      const resp = await hook({ recordId: undefined, resource, record, adminUser });
      if (!resp || (!resp.ok && !resp.error)) {
        throw new Error(`Hook beforeSave must return object with {ok: true} or { error: 'Error' } `);
      }

      if (resp.error) {
        return { error: resp.error, ok: false };
      }
    }

    // remove virtual columns from record
    for (const column of resource.columns.filter((col) => col.virtual)) {
        if (record[column.name]) {
          delete record[column.name];
        }
    }
    const connector = this.connectors[resource.dataSource];
    process.env.HEAVY_DEBUG && console.log('🪲🪲🪲🪲 creating record createResourceRecord', record);
    const { ok, error, createdRecord } = await connector.createRecord({ resource, record, adminUser });
    if (!ok) {
      return { ok, error };
    }
    
    const primaryKey = record[resource.columns.find((col) => col.primaryKey).name];

    // execute hook if needed
    for (const hook of listify(resource.hooks?.create?.afterSave as AfterSaveFunction[])) {
      console.log('Hook afterSave', hook);
      const resp = await hook({ 
        recordId: primaryKey, 
        resource, 
        record: createdRecord, 
        adminUser
      });

      if (!resp || (!resp.ok && !resp.error)) {
        throw new Error(`Hook afterSave must return object with {ok: true} or { error: 'Error' } `);
      }

      if (resp.error) {
        return { error: resp.error, ok: false };
      }
    }

    return { ok, error, createdRecord };
  }

  resource(resourceId: string) {
    if (this.statuses.dbDiscover !== 'done') {
      if (this.statuses.dbDiscover === 'running') {
        throw new Error('Database discovery is running. You can\'t use data API while database discovery is not finished.\n'+
          'Consider moving your code to a place where it will be executed after database discovery is already done (after await admin.discoverDatabases())');
      } else {
        throw new Error('Database discovery is not yet started. You can\'t use data API before database discovery is done. \n'+
          'Call admin.discoverDatabases() first and await it before using data API');
      }
    }
    if (!this.operationalResources[resourceId]) {
      const closeName = suggestIfTypo(Object.keys(this.operationalResources), resourceId);
      throw new Error(`Resource with id '${resourceId}' not found${closeName ? `. Did you mean '${closeName}'?` : ''}`);
    }
    return this.operationalResources[resourceId];
  }

  setupEndpoints(server: IHttpServer) {
    this.restApi.registerEndpoints(server);
  }
}

export default AdminForth;