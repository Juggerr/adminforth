import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';


export function guessLabelFromName(name) {
  if (name.includes('_')) {
    return name.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  } else if (name.includes('-')) {
    return name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  } else {
    // split by capital letters
    return name.split(/(?=[A-Z])/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }
}


const __filename = fileURLToPath(import.meta.url);
let __dirname = path.join(path.dirname(__filename), '..');
if (__dirname.endsWith('dist')) {
  // in prod build we are in dist also
  __dirname = path.join(__dirname, '..');
}

export const ADMIN_FORTH_ABSOLUTE_PATH = __dirname;

const package_json = JSON.parse(fs.readFileSync(path.join(ADMIN_FORTH_ABSOLUTE_PATH, 'package.json'), 'utf8'));

export const ADMINFORTH_VERSION: string = package_json.version;

export function getComponentNameFromPath(filePath) {
  return filePath.replace(/@/g, '').replace(/\./g, '').replace(/\//g, '');
}