import {spawnSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs';
// Keep native stderr out of Windows PowerShell's NativeCommandError formatter.
// Credentials must be supplied through the environment, never command arguments.
const [label,command,...args]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label??'')||!command)throw Error('Usage: record-command <safe-label> <command> [args]');
mkdirSync('.local',{recursive:true});const log='.local/'+label+'.log',fd=openSync(log,'w'),started=new Date().toISOString();
const r=spawnSync(command,args,{stdio:['ignore',fd,fd],shell:process.platform==='win32'&&['mvn','npm'].includes(command)});closeSync(fd);
const result={started,finished:new Date().toISOString(),command:[command,...args],exitCode:r.status,signal:r.signal,log};
writeFileSync('.local/'+label+'.result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=r.status??1;
