
import Auth from './auth.js';
import MongoConnector from './dataConnectors/mongo.js';
import PostgresConnector from './dataConnectors/postgres.js';
import SQLiteConnector from './dataConnectors/sqlite.js';
import CodeInjector from './modules/codeInjector.js';
import { guessLabelFromName } from './modules/utils.js';
import ExpressServer from './servers/express.js';
import {v1 as uuid} from 'uuid';
import fs from 'fs';
import { ADMINFORTH_VERSION } from './modules/utils.js';
import { AdminForthConfig, AdminForthClass, AdminForthFilterOperators, AdminForthDataTypes, AdminForthResourcePages, AdminForthFieldComponentDeclaration } from './types/AdminForthConfig.js';
import { getFunctionList } from './modules/utils.js';
import path from 'path';


//get array from enum AdminForthResourcePages

const DEFAULT_ALLOWED_ACTIONS = {create: true, edit: true, show: true, delete: true};


class AdminForth implements AdminForthClass {
  static Types = AdminForthDataTypes;

  static Utils = {
    generatePasswordHash: async (password) => {
      return await Auth.generatePasswordHash(password);
    }
  }

  #defaultConfig = {
    deleteConfirmation: true,
  }

  config: AdminForthConfig;
  express: ExpressServer;
  auth: Auth;
  codeInjector: CodeInjector;
  connectors: any;
  connectorClasses: any;
  runningHotReload: boolean;

  statuses: {
    dbDiscover?: 'running' | 'done',
  }

  constructor(config: AdminForthConfig) {
    this.config = {...this.#defaultConfig,...config};
    this.codeInjector = new CodeInjector(this);
    
    this.validateConfig();
    this.activatePlugins();
    this.validateConfig(); // revalidate after plugins

    this.express = new ExpressServer(this);
    this.auth = new Auth();
    this.connectors = {};
    this.statuses = {};
    console.log(`🚀 AdminForth v${ADMINFORTH_VERSION} starting up`)
  }

  activatePlugins() {
    for (let resource of this.config.resources) {
      for (let pluginInstance of resource.plugins || []) {
        pluginInstance.modifyResourceConfig(this, resource);
      }
    };
  }

  checkCustomFileExists(filePath: string): Array<string> {
    if (filePath.startsWith('@@/')) {
      const checkPath = path.join(this.config.customization.customComponentsDir, filePath.replace('@@/', ''));
      if (!fs.existsSync(checkPath)) {
        return [`File file ${filePath} does not exist in ${this.config.customization.customComponentsDir}`];
      }
    }
    return [];
  }

  validateComponent(component: AdminForthComponentDeclaration, errors: Array<string>): AdminForthComponentDeclaration {
    if (!component) {
      return component;
    }
    let obj = component;
    if (typeof obj === 'string') {
      obj = { file: component, meta: {} };
    }
    errors.push(...this.checkCustomFileExists(this.config.auth.loginBackgroundImage));
    
    return obj;
  }


  validateConfig() {
    const errors = [];

    if (this.config.rootUser) {
      if (!this.config.rootUser.username) {
        throw new Error('rootUser.username is required');
      }
      if (!this.config.rootUser.password) {
        throw new Error('rootUser.password is required');
      }

      console.log('\n ⚠️⚠️⚠️ [INSECURE ALERT] config.rootUser is set, please create a new user and remove config.rootUser from config before going to production\n');
    }
    
    if (!this.config.customization.customComponentsDir) {
      this.config.customization.customComponentsDir = './custom';
    }

    try {
      // check customComponentsDir exists
      fs.accessSync(this.config.customization.customComponentsDir, fs.constants.R_OK);
    } catch (e) {
      this.config.customization.customComponentsDir = undefined;
    }

    if (this.config.auth) {
      if (!this.config.auth.resourceId) {
        throw new Error('No config.auth.resourceId defined');
      }
      if (!this.config.auth.passwordHashField) {
        throw new Error('No config.auth.passwordHashField defined');
      }
      if (!this.config.auth.usernameField) {
        throw new Error('No config.auth.usernameField defined');
      }
      if (this.config.auth.loginBackgroundImage) {
        errors.push(...this.checkCustomFileExists(this.config.auth.loginBackgroundImage));
      }
      const userResource = this.config.resources.find((res) => res.resourceId === this.config.auth.resourceId);
      if (!userResource) {
        throw new Error(`Resource with id "${this.config.auth.resourceId}" not found`);
      }
    }

    if (!this.config.customization) {
      this.config.customization = {};
    }


    if (!this.config.baseUrl) {
      this.config.baseUrl = '';
    }
    if (!this.config?.customization.brandName) {
      this.config.customization.brandName = 'AdminForth';
    }
    if (this.config.customization.brandLogo) {
      errors.push(...this.checkCustomFileExists(this.config.customization.brandLogo));
    }

    if (!this.config.customization.datesFormat) {
      this.config.customization.datesFormat = 'MMM D, YYYY HH:mm:ss';
    }

    if (this.config.resources) {
      this.config.resources.forEach((res) => {
        if (!res.table) {
          errors.push(`Resource "${res.dataSource}" is missing table`);
        }
        // if recordLabel is not callable, throw error
        if (res.recordLabel && typeof res.recordLabel !== 'function') {
          errors.push(`Resource "${res.dataSource}" recordLabel is not a function`);
        }
        if (!res.recordLabel) {
          res.recordLabel = (item) => {
            const pkVal = item[res.columns.find((col) => col.primaryKey).name];
            return `${res.label} ${pkVal}`;
          }
        }


        res.resourceId = res.resourceId || res.table;
        res.label = res.label || res.table.charAt(0).toUpperCase() + res.table.slice(1);
        if (!res.dataSource) {
          errors.push(`Resource "${res.resourceId}" is missing dataSource`);
        }
        if (!res.columns) {
          res.columns = [];
        }
        res.columns.forEach((col) => {
          col.label = col.label || guessLabelFromName(col.name);
          //define default sortable
          if (!Object.keys(col).includes('sortable')) {col.sortable = true;}
          if (col.showIn && !Array.isArray(col.showIn)) {
            errors.push(`Resource "${res.resourceId}" column "${col.name}" showIn must be an array`);
          }

          // check col.required is string or object
          if (col.required && !((typeof col.required === 'boolean') || (typeof col.required === 'object'))) {
            errors.push(`Resource "${res.resourceId}" column "${col.name}" required must be a string or object`);
          }

          // if it is object check the keys are one of ['create', 'edit']
          if (typeof col.required === 'object') {
            const wrongRequiredOn = Object.keys(col.required).find((c) => !['create', 'edit'].includes(c));
            if (wrongRequiredOn) {
              errors.push(`Resource "${res.resourceId}" column "${col.name}" has invalid required value "${wrongRequiredOn}", allowed keys are 'create', 'edit']`);
            }
          }

          // same for editingNote
          if (col.editingNote && !((typeof col.editingNote === 'string') || (typeof col.editingNote === 'object'))) {
            errors.push(`Resource "${res.resourceId}" column "${col.name}" editingNote must be a string or object`);
          }
          if (typeof col.editingNote === 'object') {
            const wrongEditingNoteOn = Object.keys(col.editingNote).find((c) => !['create', 'edit'].includes(c));
            if (wrongEditingNoteOn) {
              errors.push(`Resource "${res.resourceId}" column "${col.name}" has invalid editingNote value "${wrongEditingNoteOn}", allowed keys are 'create', 'edit']`);
            }
          }

          const wrongShowIn = col.showIn && col.showIn.find((c) => AdminForthResourcePages[c] === undefined);
          if (wrongShowIn) {
            errors.push(`Resource "${res.resourceId}" column "${col.name}" has invalid showIn value "${wrongShowIn}", allowed values are ${Object.keys(AdminForthResourcePages).join(', ')}`);
          }
          col.showIn = col.showIn || Object.values(AdminForthResourcePages);
        })

        if (!res.options) {
          res.options = {bulkActions: [], allowedActions: {}};
        }


        //check if resource has bulkActions
        if(res.options?.bulkActions){
          let bulkActions = res.options.bulkActions;

          if(!Array.isArray(bulkActions)){
            errors.push(`Resource "${res.resourceId}" bulkActions must be an array`);
            bulkActions = [];
          }
          if(res.options?.allowedActions?.delete && !bulkActions.find((action) => action.label === 'Delete checked')){
            bulkActions.push({
              label: `Delete checked`,
              state: 'danger',
              icon: 'flowbite:trash-bin-outline',
              action: async ({selectedIds}) => {
                const connector = this.connectors[res.dataSource];
                await Promise.all(selectedIds.map(async (recordId) => {
                  await connector.deleteRecord({ resource: res, recordId });
                }));
              }
            });
          }  
          
          const newBulkActions = bulkActions.map((action) => {
            return Object.assign(action, {id: uuid()});
          });
          bulkActions = newBulkActions;

          // if pageInjection is a string, make array with one element. Also check file exists
          const possibleInjections = ['beforeBreadcrumbs', 'afterBreadcrumbs', 'bottom'];
          if(res.options.pageInjections) {
            Object.entries(res.options.pageInjections).map(([key, value]) => {
              Object.entries(value).map(([injection, target]) => {
                if (possibleInjections.includes(injection)) {
                  if (!Array.isArray(res.options.pageInjections[key][injection])) {
                    // not array
                    res.options.pageInjections[key][injection] = [target];
                  }
                  res.options.pageInjections[key][injection].forEach((target, i) => {
                    res.options.pageInjections[key][injection][i] = this.validateComponent(target, errors);
                  });
                } else {
                  errors.push(`Resource "${res.resourceId}" has invalid pageInjection key "${injection}", Supported keys are ${possibleInjections.join(', ')}`);
                }
              });
                  
            })
          }

        }

        //add default allowedActions to resources
        if(res.options.allowedActions){
          //check if allowedActions is an object
          if(typeof res.options.allowedActions !== 'object'){
            errors.push(`Resource "${res.resourceId}" allowedActions must be an object`);
          }
          const userAllowedActions = res.options.allowedActions 
          res.options.allowedActions = Object.assign({}, DEFAULT_ALLOWED_ACTIONS, userAllowedActions);         
        } else {
          res.options.allowedActions = DEFAULT_ALLOWED_ACTIONS;
        }
      })
    


      if (!this.config.menu) {
        errors.push('No config.menu defined');
      }

      // check if there is only one homepage: true in menu, recursivly
      let homepages = 0;
      const browseMenu = (menu) => {
        menu.forEach((item) => {
          if (item.component && item.resourceId) {
            errors.push(`Menu item cannot have both component and resourceId: ${JSON.stringify(item)}`);
          }
          if (item.component && !item.path) {
            errors.push(`Menu item with component must have path : ${JSON.stringify(item)}`);
          }

          if (item.type === 'resource' && !item.resourceId) {
            errors.push(`Menu item with type 'resource' must have resourceId : ${JSON.stringify(item)}`);
          }

          if (item.resourceId && !this.config.resources.find((res) => res.resourceId === item.resourceId)) {
            errors.push(`Menu item with type 'resourceId' has resourceId which is not in resources: ${JSON.stringify(item)}`);
          }

          if (item.type === 'component' && !item.component) {
            errors.push(`Menu item with type 'component' must have component : ${JSON.stringify(item)}`);
          }

          // make sure component starts with @@
          if (item.component) {
            if (!item.component.startsWith('@@')) {
              errors.push(`Menu item component must start with @@ : ${JSON.stringify(item)}`);
            }

            const path = item.component.replace('@@', this.config.customization.customComponentsDir);
            if ( !fs.existsSync(path) ) {
              errors.push(`Menu item component "${item.component.replace('@@', '')}" does not exist in "${this.config.customization.customComponentsDir}"`);
            }
          }

          if (item.homepage) {
            homepages++;
            if (homepages > 1) {
              errors.push('There must be only one homepage: true in menu, found second one in ' + JSON.stringify(item) );
            }
          }
          if (item.children) {
            browseMenu(item.children);
          }
        });
      };
      browseMenu(this.config.menu);

    }

    // check for duplicate resourceIds and show which ones are duplicated
    const resourceIds = this.config.resources.map((res) => res.resourceId);
    const uniqueResourceIds = new Set(resourceIds);
    if (uniqueResourceIds.size != resourceIds.length) {
      const duplicates = resourceIds.filter((item, index) => resourceIds.indexOf(item) != index);
      errors.push(`Duplicate fields "resourceId" or "table": ${duplicates.join(', ')}`);
    }

    //add ids for onSelectedAllActions for each resource
   



    if (errors.length > 0) {
      throw new Error(`Invalid AdminForth config: ${errors.join(', ')}`);
    }

    // check is all custom components files exists
    for (const resource of this.config.resources) {
      for (const column of resource.columns) {
          if (column.components) {
            Object.entries(column.components).forEach(([key, comp]) => {
              column.components[key] = this.validateComponent(comp, errors);
            });
            console.log('🔧🔧🔧 Validating components for resource', column.components);

            for (const [key, { file, meta }] of Object.entries(column.components)) {
                if (this.codeInjector.allComponentNames[file]) {
                  // not obvious, but if we are in this if, it means that this is plugin component
                  // and there is no sense to check if it exists in users folder
                  continue;
                }
                const path = file.replace('@@', this.config.customization.customComponentsDir);
                if (!fs.existsSync(path)) {
                    throw new Error(`Component file ${path} does not exist`);
                }
            }
        }
      }
    }
  }

  postProcessAfterDiscover(resource) {
    resource.columns.forEach((column) => {
      // if db/user says column is required in boolean, exapd
      if (typeof column.required === 'boolean') {
        column.required = { create: column.required, edit: column.required };
      }

      // same for editingNote
      if (typeof column.editingNote === 'string') {
        column.editingNote = { create: column.editingNote, edit: column.editingNote };
      }
    })
    resource.dataSourceColumns = resource.columns.filter((col) => !col.virtual);
  }

  async discoverDatabases() {
    this.statuses.dbDiscover = 'running';
    this.connectorClasses = {
      'sqlite': SQLiteConnector,
      'postgres': PostgresConnector,
      'mongodb': MongoConnector,
    };
    if (!this.config.databaseConnectors) {
      this.config.databaseConnectors = {...this.connectorClasses};
    }
    this.config.dataSources.forEach((ds) => {
      const dbType = ds.url.split(':')[0];
      if (!this.config.databaseConnectors[dbType]) {
        throw new Error(`Database type ${dbType} is not supported, consider using databaseConnectors in AdminForth config`);
      }
      this.connectors[ds.id] = new this.config.databaseConnectors[dbType]({url: ds.url});
    });

    await Promise.all(this.config.resources.map(async (res) => {
      if (!this.connectors[res.dataSource]) {
        throw new Error(`Resource '${res.table}' refers to unknown dataSource '${res.dataSource}'`);
      }
      const fieldTypes = await this.connectors[res.dataSource].discoverFields(res);
      if (!Object.keys(fieldTypes).length) {
        throw new Error(`Table '${res.table}' (In resource '${res.resourceId}') has no fields or does not exist`);
      }

      if (!res.columns) {
        res.columns = Object.keys(fieldTypes).map((name) => ({ name }));
      }

      res.columns.forEach((col, i) => {
        if (!fieldTypes[col.name] && !col.virtual) {
          throw new Error(`Resource '${res.table}' has no column '${col.name}'`);
        }
        // first find discovered values, but allow override
        res.columns[i] = { ...fieldTypes[col.name], ...col };
      });

      this.postProcessAfterDiscover(res);

      // check if primaryKey column is present
      if (!res.columns.some((col) => col.primaryKey)) {
        throw new Error(`Resource '${res.table}' has no column defined or auto-discovered. Please set 'primaryKey: true' in a columns which has unique value for each record and index`);
      }

    }));

    this.statuses.dbDiscover = 'done';

    // console.log('⚙️⚙️⚙️ Database discovery done', JSON.stringify(this.config.resources, null, 2));
  }

  async bundleNow({ hotReload=false, verbose=false }) {
    this.codeInjector.bundleNow({ hotReload, verbose });
  }

  setupEndpoints(server) {
    server.endpoint({
      noAuth: true,
      method: 'POST',
      path: '/login',
      handler: async ({ body, response }) => {
        const INVALID_MESSAGE = 'Invalid username or password';
        const { username, password } = body;
        let token;
        if (username === this.config.rootUser.username && password === this.config.rootUser.password) {
          token = this.auth.issueJWT({ username, pk: null  });
        } else {
          // get resource from db
          if (!this.config.auth) {
            throw new Error('No config.auth defined');
          }
          const userResource = this.config.resources.find((res) => res.resourceId === this.config.auth.resourceId);
          // if there is no passwordHashField, in columns, add it, with backendOnly and showIn: []
          if (!userResource.dataSourceColumns.find((col) => col.name === this.config.auth.passwordHashField)) {
            userResource.dataSourceColumns.push({
              name: this.config.auth.passwordHashField,
              backendOnly: true,
              showIn: [],
              type: AdminForth.Types.STRING,
            });
            console.log('Adding passwordHashField to userResource', userResource)
          }

          const userRecord = (
            await this.connectors[userResource.dataSource].getData({
              resource: userResource,
              filters: [
                { field: this.config.auth.usernameField, operator: AdminForthFilterOperators.EQ, value: username },
              ],
              limit: 1,
              offset: 0,
              sort: [],
            })
          ).data?.[0];

          if (!userRecord) {
            return { error: 'User not found' };
          }

          const passwordHash = userRecord[this.config.auth.passwordHashField];
          console.log('User record', userRecord, passwordHash)  // why does it has no hash?
          const valid = await Auth.verifyPassword(password, passwordHash);
          if (valid) {
            token = this.auth.issueJWT({ 
              username, pk: userRecord[userResource.columns.find((col) => col.primaryKey).name]
            });
          } else {
            return { error: INVALID_MESSAGE };
          }
        }

        response.setHeader('Set-Cookie', `adminforth_jwt=${token}; Path=${this.config.baseUrl || '/'}; HttpOnly; SameSite=Strict`);
        return { ok: true };
      },
    });

    server.endpoint({
        noAuth: true,
        method: 'POST',
        path: '/logout',
        handler: async ({ response }) => {
          response.setHeader('Set-Cookie', `adminforth_jwt=; Path=${this.config.baseUrl || '/'}; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
          return { ok: true };
        },
    })

    server.endpoint({
      noAuth: true,
      method: 'GET',
      path: '/get_public_config',
      handler: async ({ body }) => {

        // find resource
        if (!this.config.auth) {
          throw new Error('No config.auth defined');
        }
        const usernameField = this.config.auth.usernameField;
        const resource = this.config.resources.find((res) => res.resourceId === this.config.auth.resourceId);
        const usernameColumn = resource.columns.find((col) => col.name === usernameField);

        return {
          brandName: this.config.customization.brandName,
          usernameFieldName: usernameColumn.label,
          loginBackgroundImage: this.config.auth.loginBackgroundImage,
          title: this.config.customization?.title,
        };
      },
    });

    server.endpoint({
      method: 'GET',
      path: '/get_base_config',
      handler: async ({input, adminUser, cookies}) => {
        const cookieParsed = this.auth.verify(cookies['adminforth_jwt']);
        let username = ''
        let userFullName = ''
        if (cookieParsed['pk'] == null) {
            username = this.config.rootUser.username;
        } else {
            const userResource = this.config.resources.find((res) => res.resourceId === this.config.auth.resourceId);
            const user = await this.connectors[userResource.dataSource].getData({
              resource: userResource,
              filters: [
                { field: userResource.columns.find((col) => col.primaryKey).name, operator: AdminForthFilterOperators.EQ, value: cookieParsed['pk'] },
              ],
              limit: 1,
              offset: 0,
              sort: [],
            });
            if (!user.data.length) {
              return { error: 'Unauthorized' };
            }
            username = user.data[0][this.config.auth.usernameField]; 
            userFullName = user.data[0][this.config.auth.userFullNameField];
        }

        const userData = {
            [this.config.auth.usernameField]: username,
            [this.config.auth.userFullNameField]: userFullName
        };
        return {
          user: userData,
          resources: this.config.resources.map((res) => ({
            resourceId: res.resourceId,
            label: res.label,
          })),
          menu: this.config.menu,
          config: { 
            brandName: this.config.customization.brandName,
            brandLogo: this.config.customization.brandLogo,
            datesFormat: this.config.customization.datesFormat,
            deleteConfirmation: this.config.deleteConfirmation,
            auth: this.config.auth,
            usernameField: this.config.auth.usernameField,
            title: this.config.customization?.title,
            emptyFieldPlaceholder: this.config.customization?.emptyFieldPlaceholder,
          },
          adminUser,
          version: ADMINFORTH_VERSION,
        };
      },
    });

    server.endpoint({
      method: 'POST',
      path: '/get_resource',
      handler: async ({ body }) => {
        const { resourceId } = body;
        if (!this.statuses.dbDiscover) {
          return { error: 'Database discovery not started' };
        }
        if (this.statuses.dbDiscover !== 'done') {
          return { error : 'Database discovery is still in progress, please try later' };
        }
        const resource = this.config.resources.find((res) => res.resourceId == resourceId);
        if (!resource) {
          return { error: `Resource ${resourceId} not found` };
        }
        // exclude "plugins" key
        return { resource: { ...resource, plugins: undefined } };
      },
    });
    server.endpoint({
      method: 'POST',
      path: '/get_resource_data',
      handler: async ({ body, adminUser }) => {
        const { resourceId, source } = body;
        if (['show', 'list'].includes(source) === false) {
          return { error: 'Invalid source, should be list or show' };
        }
        if (!this.statuses.dbDiscover) {
          return { error: 'Database discovery not started' };
        }
        if (this.statuses.dbDiscover !== 'done') {
          return { error : 'Database discovery is still in progress, please try later' };
        }
        const resource = this.config.resources.find((res) => res.resourceId == resourceId);
        if (!resource) {
          return { error: `Resource ${resourceId} not found` };
        }

        for (const hook of getFunctionList(resource.hooks?.[source]?.beforeDatasourceRequest)) {
          const resp = await hook({ resource, query: body, adminUser });
          if (!resp || (!resp.ok && !resp.error)) {
            throw new Error(`Hook must return object with {ok: true} or { error: 'Error' } `);
          }

          if (resp.error) {
            return { error: resp.error };
          }
        }
        const { limit, offset, filters, sort } = body;

        for (const filter of (filters || [])) {
          if (!Object.values(AdminForthFilterOperators).includes(filter.operator)) {
              throw new Error(`Operator '${filter.operator}' is not allowed`);
          }

          if (!resource.columns.some((col) => col.name === filter.field)) {
              throw new Error(`Field '${filter.field}' is not in resource '${resource.resourceId}'. Available fields: ${resource.columns.map((col) => col.name).join(', ')}`);
          }

          if (filter.operator === AdminForthFilterOperators.IN || filter.operator === AdminForthFilterOperators.NIN) {
              if (!Array.isArray(filter.value)) {
                  throw new Error(`Value for operator '${filter.operator}'' should be an array`);
              }
          }

          if (filter.operator === AdminForthFilterOperators.IN && filter.value.length === 0) {
              // nonsense
              return { data: [], total: 0 };
          }
      }

        const data = await this.connectors[resource.dataSource].getData({
          resource,
          limit,
          offset,
          filters,
          sort,
        });
        // for foreign keys, add references
        await Promise.all(
          resource.columns.filter((col) => col.foreignResource).map(async (col) => {
            const targetResource = this.config.resources.find((res) => res.resourceId == col.foreignResource.resourceId);
            const targetConnector = this.connectors[targetResource.dataSource];
            const targetResourcePkField = targetResource.columns.find((col) => col.primaryKey).name;
            const pksUnique = [...new Set(data.data.map((item) => item[col.name]))];
            if (pksUnique.length === 0) {
              return;
            }
            const targetData = await targetConnector.getData({
              resource: targetResource,
              limit: limit,
              offset: 0,
              filters: [
                {
                  field: targetResourcePkField,
                  operator: AdminForthFilterOperators.IN,
                  value: pksUnique,
                }
              ],
              sort: [],
            });
            const targetDataMap = targetData.data.reduce((acc, item) => {
              acc[item[targetResourcePkField]] = {
                label: targetResource.recordLabel(item),
                pk: item[targetResourcePkField],
              }
              return acc;
            }, {});
            data.data.forEach((item) => {
              item[col.name] = targetDataMap[item[col.name]];
            });
          })
        );

        for (const hook of getFunctionList(resource.hooks?.[source]?.afterDatasourceResponse)) {
          const resp = await hook({ resource, response: data.data, adminUser });
          if (!resp || (!resp.ok && !resp.error)) {
            throw new Error(`Hook must return object with {ok: true} or { error: 'Error' } `);
          }

          if (resp.error) {
            return { error: resp.error };
          }
        }

        // remove all columns which are not defined in resources, or defined but backendOnly
        data.data.forEach((item) => {
          Object.keys(item).forEach((key) => {
            if (!resource.columns.find((col) => col.name === key) || resource.columns.find((col) => col.name === key && col.backendOnly)) {
              delete item[key];
            }
          })
        });

        data.data.forEach((item) => {
          item._label = resource.recordLabel(item);
        });

        return {
          ...data, 
          options: resource?.options,
        };
      },
    });
    server.endpoint({
      method: 'POST',
      path: '/get_resource_foreign_data',
      handler: async ({ body, adminUser }) => {
        const { resourceId, column } = body;
        if (!this.statuses.dbDiscover) {
          return { error: 'Database discovery not started' };
        }
        if (this.statuses.dbDiscover !== 'done') {
          return { error : 'Database discovery is still in progress, please try later' };
        }
        const resource = this.config.resources.find((res) => res.resourceId == resourceId);
        if (!resource) {
          return { error: `Resource '${resourceId}' not found` };
        }
        const columnConfig = resource.columns.find((col) => col.name == column);
        if (!columnConfig) {
          return { error: `Column "${column}' not found in resource with resourceId '${resourceId}'` };
        }
        if (!columnConfig.foreignResource) {
          return { error: `Column '${column}' in resource '${resourceId}' is not a foreign key` };
        }
        const targetResourceId = columnConfig.foreignResource.resourceId;
        const targetResource = this.config.resources.find((res) => res.resourceId == targetResourceId);

        for (const hook of getFunctionList(columnConfig.foreignResource.hooks?.dropdownList?.beforeDatasourceRequest)) {
          const resp = await hook({ query: body, adminUser });
          if (!resp || (!resp.ok && !resp.error)) {
            throw new Error(`Hook must return object with {ok: true} or { error: 'Error' } `);
          }

          if (resp.error) {
            return { error: resp.error };
          }
        }
        const { limit, offset, filters, sort } = body;
        const dbDataItems = await this.connectors[targetResource.dataSource].getData({
          resource: targetResource,
          limit,
          offset,
          filters: filters || [],
          sort: sort || [],
        });
        const items = dbDataItems.data.map((item) => {
          const pk = item[targetResource.columns.find((col) => col.primaryKey).name];
          const labler = targetResource.recordLabel;
          return { 
            value: pk,
            label: labler(item),
            _item: item, // user might need it in hook to form new label
          }
        });
        const response = {
          items
        };

        for (const hook of getFunctionList(columnConfig.foreignResource.hooks?.dropdownList?.afterDatasourceResponse)) {
          const resp = await hook({ response, adminUser });
          if (!resp || (!resp.ok && !resp.error)) {
            throw new Error(`Hook must return object with {ok: true} or { error: 'Error' } `);
          }

          if (resp.error) {
            return { error: resp.error };
          }
        }
       
        return response;
      },
    });

    server.endpoint({
      method: 'POST',
      path: '/get_min_max_for_columns',
      handler: async ({ body }) => {
        const { resourceId } = body;
        if (!this.statuses.dbDiscover) {
          return { error: 'Database discovery not started' };
        }
        if (this.statuses.dbDiscover !== 'done') {
          return { error : 'Database discovery is still in progress, please try later' };
        }
        const resource = this.config.resources.find((res) => res.resourceId == resourceId);
        if (!resource) {
          return { error: `Resource '${resourceId}' not found` };
        }
        const item = await this.connectors[resource.dataSource].getMinMaxForColumns({
          resource,
          columns: resource.columns.filter((col) => [
            AdminForthDataTypes.INTEGER, 
            AdminForthDataTypes.FLOAT,
            AdminForthDataTypes.DATE,
            AdminForthDataTypes.DATETIME,
            AdminForthDataTypes.TIME,
            AdminForthDataTypes.DECIMAL,
          ].includes(col.type) && col.allowMinMaxQuery === true),
        });
        return item;
      },
    });

    server.endpoint({
        method: 'POST',
        path: '/create_record',
        handler: async ({ body, adminUser }) => {
            console.log('create_record', body, this.config.resources);
            const resource = this.config.resources.find((res) => res.resourceId == body['resourceId']);
            if (!resource) {
                return { error: `Resource '${body['resourceId']}' not found` };
            }
            
            const record = body['record'];
            // execute hook if needed
            for (const hook of getFunctionList(resource.hooks?.create?.beforeSave)) {
              const resp = await hook({ resource, record, adminUser });
              if (!resp || (!resp.ok && !resp.error)) {
                throw new Error(`Hook beforeSave must return object with {ok: true} or { error: 'Error' } `);
              }

              if (resp.error) {
                return { error: resp.error };
              }
            }

            for (const column of resource.columns) {
                if (column.fillOnCreate) {
                    if (body['record'][column.name] === undefined) {
                        body['record'][column.name] = column.fillOnCreate({
                            initialRecord: body['record'], adminUser
                         });
                    }
                }
                if ((column.required as {create?: boolean, edit?: boolean}) ?.create && body['record'][column.name] === undefined) {
                    return { error: `Column '${column.name}' is required` };
                }

                if (column.isUnique) {
                    const existingRecord = await this.connectors[resource.dataSource].getData({
                        resource,
                        filters: [{ field: column.name, operator: AdminForthFilterOperators.EQ, value: body['record'][column.name] }],
                        limit: 1,
                        sort: [],
                        offset: 0
                    });
                    if (existingRecord.data.length > 0) {
                        return { error: `Record with ${column.name} ${body['record'][column.name]} already exists` };
                    }
                }
            }

            // remove virtual columns from record
            for (const column of resource.columns.filter((col) => col.virtual)) {
                if (record[column.name]) {
                  delete record[column.name];
                }
            }
            const connector = this.connectors[resource.dataSource];
            await connector.createRecord({ resource, record });
            // execute hook if needed
            for (const hook of getFunctionList(resource.hooks?.create?.afterSave)) {
              const resp = await hook({ resource, record, adminUser });
              if (!resp || (!resp.ok && !resp.error)) {
                throw new Error(`Hook afterSave must return object with {ok: true} or { error: 'Error' } `);
              }

              if (resp.error) {
                return { error: resp.error };
              }
            }

            return {
              newRecordId: body['record'][connector.getPrimaryKey(resource)]
            }
        }
    });
    server.endpoint({
        method: 'POST',
        path: '/update_record',
        handler: async ({ body, adminUser }) => {
            const resource = this.config.resources.find((res) => res.resourceId == body['resourceId']);
            if (!resource) {
                return { error: `Resource '${body['resourceId']}' not found` };
            }

            const recordId = body['recordId'];
            const connector = this.connectors[resource.dataSource];
            const oldRecord = await connector.getRecordByPrimaryKey(resource, recordId)
            if (!oldRecord) {
                const primaryKeyColumn = resource.columns.find((col) => col.primaryKey);
                return { error: `Record with ${primaryKeyColumn.name} ${recordId} not found` };
            }
            const record = body['record'];

            // execute hook if needed
            for (const hook of getFunctionList(resource.hooks?.edit?.beforeSave)) {
              const resp = await hook({ resource, record, adminUser });
              if (!resp || (!resp.ok && !resp.error)) {
                throw new Error(`Hook beforeSave must return object with {ok: true} or { error: 'Error' } `);
              }

              if (resp.error) {
                return { error: resp.error };
              }
            }
            const newValues = {};

            for (const recordField in record) {
              if (record[recordField] !== oldRecord[recordField]) {
                const column = resource.columns.find((col) => col.name === recordField);
                if (column) {
                  if (!column.virtual) {
                    newValues[recordField] = connector.setFieldValue(column, record[recordField]);
                  }
                } else {
                  newValues[recordField] = record[recordField];
                }
              }
            } 

            console.log('✅ newValues', newValues)
            if (Object.keys(newValues).length > 0) {
                await connector.updateRecord({ resource, recordId, record, newValues});
            }
            
            // execute hook if needed
            for (const hook of getFunctionList(resource.hooks?.edit?.afterSave)) {
              const resp = await hook({ resource, record, adminUser });
              if (!resp || (!resp.ok && !resp.error)) {
                throw new Error(`Hook afterSave must return object with {ok: true} or { error: 'Error' } `);
              }

              if (resp.error) {
                return { error: resp.error };
              }
            }

            return {
              newRecordId: recordId
            }
        }
    });
    server.endpoint({
        method: 'POST',
        path: '/delete_record',
        handler: async ({ body, adminUser }) => {
            const resource = this.config.resources.find((res) => res.resourceId == body['resourceId']);
            const record = await this.connectors[resource.dataSource].getRecordByPrimaryKey(resource, body['primaryKey']);
            if (!resource) {
                return { error: `Resource '${body['resourceId']}' not found` };
            }
            if (!record){
                return { error: `Record with ${body['primaryKey']} not found` };
            }
            if (resource.options.allowedActions.delete === false) {
                return { error: `Resource '${resource.resourceId}' does not allow delete action` };
            }

            // execute hook if needed
            for (const hook of getFunctionList(resource.hooks?.delete?.beforeSave)) {
              const resp = await hook({ resource, record, adminUser });
              if (!resp || (!resp.ok && !resp.error)) {
                throw new Error(`Hook beforeSave must return object with {ok: true} or { error: 'Error' } `);
              }

              if (resp.error) {
                return { error: resp.error };
              }
            }

            const connector = this.connectors[resource.dataSource];
            await connector.deleteRecord({ resource, recordId: body['primaryKey']});

            // execute hook if needed
            for (const hook of getFunctionList(resource.hooks?.delete?.afterSave)) {
              const resp = await hook({ resource, record, adminUser });
              if (!resp || (!resp.ok && !resp.error)) {
                throw new Error(`Hook afterSave must return object with {ok: true} or { error: 'Error' } `);
              }

              if (resp.error) {
                return { error: resp.error };
              }
            }
            return {
              recordId: body['primaryKey']
            }
        }
    });
    server.endpoint({
        method: 'POST',
        path: '/start_bulk_action',
        handler: async ({ body }) => {
            const { resourceId, actionId, recordIds } = body;
            const resource = this.config.resources.find((res) => res.resourceId == resourceId);
            if (!resource) {
                return { error: `Resource '${resourceId}' not found` };
            }
            const action = resource.options.bulkActions.find((act) => act.id == actionId);
            if (!action) {
                return { error: `Action '${actionId}' not found` };
            } else{
              await action.action({selectedIds:recordIds})

            }
            return {
              actionId,
              recordIds,
              resourceId,
              status:'success'
              
            }
        }
    })
  }
}

export default AdminForth;