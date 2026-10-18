import {spawnSync} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,statfsSync,statSync,chmodSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
const mode=process.argv[2],file=resolve(process.argv[3]??''),schema=process.env.BACKUP_SCHEMA;
const localRelative=relative(resolve('.local'),file);
if(!['backup','restore'].includes(mode)||localRelative.startsWith('..')||isAbsolute(localRelative)||!localRelative||!/^bid_arena_(?:it|restore)_[a-z0-9]{8,48}$/.test(schema??''))throw Error('Use isolated schema and an ignored .local file; production adapter requires separate review');
const key=Buffer.from(process.env.BACKUP_KEY??'','hex');if(key.length!==32)throw Error('Supply independent 32-byte BACKUP_KEY');
const user=process.env.BACKUP_DB_USER,password=process.env.BACKUP_DB_PASSWORD;
if(!/^[a-z0-9_]{3,48}$/.test(user??'')||!password)throw Error('Dedicated backup identity required');
if(/[\r\n]/.test(password))throw Error('Invalid credential format');
function mysql(program,args,input=Buffer.alloc(0)){const r=spawnSync('docker',['compose','exec','-T','mysql','sh','-c','IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec "$@"','sh',program,`-u${user}`,...args],{input:Buffer.concat([Buffer.from(password+'\n'),Buffer.from(input)]),encoding:null,maxBuffer:128*1024*1024});if(r.status!==0)throw Error('Backup database command failed');return r.stdout;}
if(mode==='backup'){
 if(existsSync(file))throw Error('Refusing overwrite');const space=statfsSync(dirname(file));if(Number(space.bavail)*Number(space.bsize)<512*1024*1024)throw Error('Less than 512 MiB free');
 const data=mysql('mysqldump',['--single-transaction','--no-tablespaces','--set-gtid-purged=OFF',schema]);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(data),cipher.final()]);
 writeFileSync(file,Buffer.concat([Buffer.from('BAK1'),iv,cipher.getAuthTag(),body]),{flag:'wx',mode:0o600});chmodSync(file,0o600);console.log('PASS: encrypted backup created; retain at most 7 daily copies with external scheduler');
}else{
 if(statSync(file).size>128*1024*1024)throw Error('Backup exceeds bounded adapter');const b=readFileSync(file);if(b.subarray(0,4).toString()!=='BAK1')throw Error('Invalid archive');
 const decipher=createDecipheriv('aes-256-gcm',key,b.subarray(4,16));decipher.setAuthTag(b.subarray(16,32));const data=Buffer.concat([decipher.update(b.subarray(32)),decipher.final()]);
 mysql('mysql',[],`CREATE DATABASE \`${schema}\`;`); // no IF NOT EXISTS: refuse existing targets
 mysql('mysql',[schema],data);console.log('RESTORED: run migration validation and reconciliation before use; never route traffic yet');
}
