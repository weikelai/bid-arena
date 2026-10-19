import {readFileSync,appendFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const file='.env',text=readFileSync(file,'utf8');
let extra='';for(const name of ['AGENT_CONTROL_SECRET','AGENT_VAULT_KEY']){
 const match=text.match(new RegExp('^'+name+'=(.*)$','m'));
 if(match&&!match[1].trim())throw Error('Remove empty '+name+' entry before initialization');
 if(!match)extra+='\n'+name+'='+randomBytes(32).toString('hex');
}
if(extra)appendFileSync(file,extra+'\n',{mode:0o600});
console.log('Agent private runtime configuration ready; existing values preserved, credentials omitted.');
