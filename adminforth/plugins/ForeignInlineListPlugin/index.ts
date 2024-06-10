import { AdminForthResource } from "../../types/AdminForthConfig.js";
import AdminForthPlugin from "../base.js";

type PluginOptions = {
  foreignResourceId: string;
}

export default class ForeignInlineListPlugin extends AdminForthPlugin {
  foreignResource: AdminForthResource;
  options: PluginOptions;

  constructor(options: PluginOptions) {
    super();
    this.options = options;
    console.log('ForeignInlineListPlugin', this);
  }

  modifyResourceConfig(adminforth: AdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);

    // get resource with foreignResourceId
    this.foreignResource = adminforth.config.resources.find((resource) => resource.resourceId === this.options.foreignResourceId);
    if (!this.foreignResource) {
      throw new Error(`ForeignInlineListPlugin: Resource with ID "${this.options.foreignResourceId}" not found`);
    }

    resourceConfig.columns.push({
      name: `foreignInlineList_${this.foreignResource.resourceId}`,
      label: 'Foreign Inline List',
      virtual: true,
      showIn: ['show'],
    });
  }
}