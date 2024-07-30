import { AdminForthResource, IAdminForthPlugin, IAdminForth } from './types/AdminForthConfig.js';
import { getComponentNameFromPath } from './modules/utils.js';
import { currentFileDir } from './modules/utils.js';
import path from 'path';
import fs from 'fs';

import crypto from 'crypto';


export default class AdminForthPlugin implements IAdminForthPlugin {

  adminforth: IAdminForth;
  pluginDir: string;
  customFolderName: string = 'custom';
  pluginInstanceId: string;
  customFolderPath: string;
  pluginOptions: any;

  constructor(pluginOptions: any, metaUrl: string) {
    // set up plugin here
    this.pluginDir = currentFileDir(metaUrl);
    this.customFolderPath = path.join(this.pluginDir, this.customFolderName);
    this.pluginOptions = pluginOptions;
  }

  setupEndpoints(server: any) {
    
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    return 'non-uniquely-identified';
  }

  modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    this.pluginInstanceId = crypto.createHash('sha256').update(
      `af_pl_${this.constructor.name}_${resourceConfig.resourceId}_${this.instanceUniqueRepresentation(this.pluginOptions)}`
    ).digest('hex')
      
    this.adminforth = adminforth;
  }

  componentPath(componentFile: string) {
    const key = `@@/plugins/${this.constructor.name}/${componentFile}`;
    const componentName = getComponentNameFromPath(key);

    if (!this.adminforth.codeInjector.srcFoldersToSync[this.customFolderPath]) {
      this.adminforth.codeInjector.srcFoldersToSync[this.customFolderPath] = `./plugins/${this.constructor.name}/`;
    }
    
    if (!this.adminforth.codeInjector.allComponentNames[key]) {
      const absSrcPath = path.join(this.customFolderPath, componentFile);
      if (!fs.existsSync(absSrcPath)) {
        throw new Error(`Plugin "${this.constructor.name}" tried to use file as component which does not exist at "${absSrcPath}"`);
      }
      this.adminforth.codeInjector.allComponentNames[key] = componentName;
    }

    return key;
  }

}