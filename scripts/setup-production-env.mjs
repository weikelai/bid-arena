import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';

const target=resolve(process.env.PRODUCTION_ENV_FILE??'.local/production.env');
const local=relative(resolve('.local'),target);
if(!local||local.startsWith('..')||isAbsolute(local))throw Error('Production environment must remain inside ignored .local');
if(existsSync(target))throw Error('Refusing to overwrite existing production configuration');
let template=readFileSync(new URL('../deploy/production.env.example',import.meta.url),'utf8');
for(const name of ['PROD_ROOT_PASSWORD','PROD_MIGRATION_PASSWORD','PROD_RUNTIME_PASSWORD']){
  template=template.replace(new RegExp('^'+name+'=$','m'),name+'='+randomBytes(32).toString('hex'));
}
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,template,{flag:'wx',mode:0o600});
console.log('Created private production configuration with independent random secrets. Set TLS_DIRECTORY before validation; verify Windows ACL separately. No existing configuration was replaced.');
