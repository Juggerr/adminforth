import {  AdminForthPlugin } from "adminforth";
import type { AdminForthResource, AdminUser, IAdminForth, IHttpServer, IAdminForthAuth, BeforeLoginConfirmationFunction, IAdminForthHttpResponse } from "adminforth";
import twofactor from 'node-2fa';
import  { PluginOptions } from "./types.js"

export default class TwoFactorsAuthPlugin extends AdminForthPlugin {
  options: PluginOptions;
  adminforth: IAdminForth;
  authResource: AdminForthResource;
  connectors: any;
  adminForthAuth: IAdminForthAuth;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    return `single`;
  }

  modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);
    this.adminforth = adminforth;
    this.adminForthAuth = adminforth.auth;
    const customPages = this.adminforth.config.customization.customPages
    customPages.push({
      path:'/confirm2fa',
      component: { file: this.componentPath('TwoFactorsConfirmation.vue'), meta: { customLayout: true }}
    })
    customPages.push({
      path:'/setup2fa',
      component: { file: this.componentPath('TwoFactorsSetup.vue'), meta: { title: 'Setup 2FA', customLayout: true }}
    })
    this.activate( resourceConfig, adminforth )
  }

  activate ( resourceConfig: AdminForthResource, adminforth: IAdminForth ){
    if (!this.options.twoFaSecretFieldName){
      throw new Error('twoFaSecretFieldName is required')
    }
    if (typeof this.options.twoFaSecretFieldName !=='string'){
      throw new Error('twoFaSecretFieldName must be a string')
    }
    this.authResource = resourceConfig
    if(!this.authResource.columns.some((col)=>col.name === this.options.twoFaSecretFieldName)){
      throw new Error(`Column ${this.options.twoFaSecretFieldName} not found in ${this.authResource.label}`)
    }
    (this.adminforth.config.auth.beforeLoginConfirmation as BeforeLoginConfirmationFunction[]).push(
      async({ adminUser, response }: { adminUser: AdminUser, response: IAdminForthHttpResponse} )=> {
        const secret = adminUser.dbUser[this.options.twoFaSecretFieldName]
        const userName = adminUser.dbUser[adminforth.config.auth.usernameField]
        const brandName = adminforth.config.customization.brandName
        const authResource = adminforth.config.resources.find((res)=>res.resourceId === adminforth.config.auth.usersResourceId )
        const authPk = authResource.columns.find((col)=>col.primaryKey).name
        const userPk = adminUser.dbUser[authPk]
        let newSecret = null
        if (!secret){
          const tempSecret = twofactor.generateSecret({name: brandName,account: userName})
          newSecret = tempSecret.secret
        } else {
          const value = this.adminforth.auth.issueJWT({userName,  issuer:brandName, pk:userPk },'tempTotp');
          response.setHeader('Set-Cookie', `adminforth_totpTemporaryJWT=${value}; Path=${this.adminforth.config.baseUrl || '/'}; HttpOnly; SameSite=Strict; max-age=3600; `);

          return {
            body:{
              loginAllowed: false,
              redirectTo: '/confirm2fa',
             
            },
            ok: true
            
          }
        }
        const totpTemporaryJWT = this.adminforth.auth.issueJWT({userName, newSecret, issuer:brandName, pk:userPk },'tempTotp', ) 
        response.setHeader('Set-Cookie', `adminforth_totpTemporaryJWT=${totpTemporaryJWT}; Path=${this.adminforth.config.baseUrl || '/'}; HttpOnly; SameSite=Strict; Expires=${new Date(Date.now() + '1h').toUTCString() } `);
        
        return { 
          body:{
            loginAllowed: false,
            redirectTo: secret ? '/confirm2fa' : '/setup2fa', 
          },
          ok: true
        }
      })
  }

  setupEndpoints(server: IHttpServer): void {
    server.endpoint({
      method: 'POST',
      path: `/plugin/twofa/initSetup`,
      noAuth: true,
      handler: async (server) => {
        const toReturn = {totpJWT:null,status:'ok',}

        const totpTemporaryJWT = server.cookies.find((cookie)=>cookie.key === 'adminforth_totpTemporaryJWT')?.value;
        if (totpTemporaryJWT){
          toReturn.totpJWT = totpTemporaryJWT
        }
        return toReturn
      }
    })
    server.endpoint({
      method: 'POST',
      path: `/plugin/twofa/confirmSetup`,
      noAuth: true,
      handler: async ({ body, adminUser, response, cookies  }) => {
        const totpTemporaryJWT = cookies.find((cookie)=>cookie.key === 'adminforth_totpTemporaryJWT')?.value;
        const decoded = await this.adminforth.auth.verify(totpTemporaryJWT, 'tempTotp');
        if ( !decoded ) {
          return {status:'error',message:'Invalid token'}
        }
        if (decoded.newSecret) {
          const verified = twofactor.verifyToken(decoded.newSecret, body.code);
          if (verified) { 
            this.connectors = this.adminforth.connectors
            const connector = this.connectors[this.authResource.dataSource];
            await connector.updateRecord({resource:this.authResource, recordId:decoded.pk, newValues:{[this.options.twoFaSecretFieldName]: decoded.newSecret}})
            this.adminforth.auth.removeCustomCookie({response, name:'totpTemporaryJWT'})
            this.adminforth.auth.setAuthCookie({response, username:decoded.userName, pk:decoded.pk})
            return { status: 'ok', allowedLogin: true }
          } else {
            return {error: 'Wrong or expired OTP code'}
          }
        } else {
         // user already has secret, get it
          this.connectors = this.adminforth.connectors
          const connector = this.connectors[this.authResource.dataSource];
          const user = await connector.getRecordByPrimaryKey(this.authResource, decoded.pk)
          const verified = twofactor.verifyToken(user[this.options.twoFaSecretFieldName], body.code);
          if (verified) { 
            this.adminforth.auth.removeCustomCookie({response, name:'totpTemporaryJWT'})
            this.adminforth.auth.setAuthCookie({response, username:decoded.userName, pk:decoded.pk})
            return { status: 'ok', allowedLogin: true }
          } else {
            return {error: 'Wrong or expired OTP code'}
          }
       }
      }
    })
  }
}