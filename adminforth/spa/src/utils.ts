import { onMounted, ref, resolveComponent } from 'vue';
import type { CoreConfig } from './spa_types/core';
import type { ValidationObject } from './types/AdminForthConfig';


import router from "./router";
import { useCoreStore } from './stores/core';
import { useUserStore } from './stores/user';
import { Dropdown } from 'flowbite';


export async function callApi({path, method, body=undefined}: {
  path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' 
  body?: any
}): Promise<any> {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
  const fullPath = `${import.meta.env.VITE_ADMINFORTH_PUBLIC_PATH || ''}${path}`;
  const r = await fetch(fullPath, options);
  if (r.status == 401 ) {
    useUserStore().unauthorize();
    await router.push({ name: 'login' });
    return null;
  } 
  return await r.json();
}

export async function callAdminForthApi({ path, method, body=undefined, headers=undefined }: {
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any,
  headers?: Record<string, string>
}): Promise<any> {
  try {
    return callApi({path: `/adminapi/v1${path}`, method, body} );
  } catch (e) {
    console.error('error', e);
    return { error: `Unexpected error: ${e}` };
  }
}

export function getCustomComponent({ file, meta }: { file: string, meta?: any }) {
  const name = file.replace(/@/g, '').replace(/\./g, '').replace(/\//g, '');
  return resolveComponent(name);
}

export function getIcon(icon: string) {
  // icon format is "feather:icon-name". We need to get IconName in pascal case
  if (!icon.includes(':')) {
    throw new Error('Icon name should be in format "icon-set:icon-name"');
  }
  const [iconSet, iconName] = icon.split(':');
  const compName = 'Icon' + iconName.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return resolveComponent(compName);
}

export const loadFile = (file: string) => {
  if (file.startsWith('http')) {
    return file;
  }
  let path;
  let baseUrl = '';
  if (file.startsWith('@/')) {
    path = file.replace('@/', '');
    baseUrl = new URL(`./${path}`, import.meta.url).href;
  } else if (file.startsWith('@@/')) {
    path = file.replace('@@/', '');
    baseUrl = new URL(`./custom/${path}`, import.meta.url).href;
  } else {
    baseUrl = new URL(`./${file}`, import.meta.url).href;
  }
  return baseUrl;
}

export function checkEmptyValues(value: any, viewType: 'show' | 'list' ) {
  const config: CoreConfig | {} = useCoreStore().config;
  let emptyFieldPlaceholder = '';
  if (config.emptyFieldPlaceholder) {
    if(typeof config.emptyFieldPlaceholder === 'string') {
      emptyFieldPlaceholder = config.emptyFieldPlaceholder;
    } else {
       emptyFieldPlaceholder = config.emptyFieldPlaceholder?.[viewType] || '';
    }
    if (value === null || value === undefined || value === '') {
      return emptyFieldPlaceholder;
    }
  }
  return value;
}

export function checkAcessByAllowedActions(allowedActions:any, action:any ) {
  if (!allowedActions) {
    console.warn('allowedActions not set');
    return;
  }
  if(allowedActions[action] === false) {
    console.warn(`Action ${action} is not allowed`);
    router.back();
  }
}

export function initThreeDotsDropdown() {
  const threeDotsDropdown: HTMLElement | null = document.querySelector('#listThreeDotsDropdown');
  if (threeDotsDropdown) {
    // this resource has three dots dropdown
    const dd = new Dropdown(
      threeDotsDropdown, 
      document.querySelector('[data-dropdown-toggle="listThreeDotsDropdown"]') as HTMLElement, 
    );
    window.adminforth.list.closeThreeDotsDropdown = () => {
      dd.hide();
    }
  }
}

export function applyRegexValidation(value: any, validation: ValidationObject[] | undefined) {

  if ( validation?.length ) {
    const validationArray = validation;
    for (let i = 0; i < validationArray.length; i++) {
      if (validationArray[i].regExp) {
        let flags = '';
        if (validationArray[i].caseSensitive) {
          flags += 'i';
        }
        if (validationArray[i].multiline) {
          flags += 'm';
        }
        if (validationArray[i].global) {
          flags += 'g';
        }

        const regExp = new RegExp(validationArray[i].regExp, flags);
        if (value === undefined || value === null) {
          value = '';
        }
        let valueS = `${value}`;

        if (!regExp.test(valueS)) {
          return validationArray[i].message;
        }
      }
    }
  }
}

export function currentQuery() {
  return router.currentRoute.value.query;
}

export function setQuery(query: any) {
  const currentQuery = { ...router.currentRoute.value.query, ...query };
  router.replace({
    query: currentQuery,
  });
}

export function verySimpleHash(str: string): string {
  return `${str.split('').reduce((a, b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)}`;
}

export function humanifySize(size) {
  if (!size) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}
