import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

function git(...args) {
  const r=spawnSync('git',args,{encoding:null,maxBuffer:64*1024*1024});
  if(r.status!==0)throw new Error(`git ${args[0]} failed`);
  return r.stdout;
}
const secrets=[];
for(const file of ['.env','.local/test.env','.local/production.env'])if(existsSync(file)) {
  for(const line of readFileSync(file,'utf8').split(/\r?\n/)) {
    const match=line.match(/^[A-Z_]*(?:PASSWORD|TOKEN|SECRET|API_KEY)=(.+)$/);
    if(match&&match[1].length>=8)secrets.push(Buffer.from(match[1]));
  }
}
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{40,}\b/,/\bAKIA[A-Z0-9]{16}\b/,/["'](?:token|access_token|refresh_token)["']\s*:\s*["'][A-Za-z0-9_-]{32,}["']/i];
// PowerShell can redirect native output as UTF-16LE. Check decoded text too,
// without printing a matching credential value.
function sensitive(data){
  const decoded=data[0]===255&&data[1]===254?data.toString('utf16le'):data.toString('utf8');
  return secrets.some(secret=>data.includes(secret)||decoded.includes(secret.toString('utf8')))||patterns.some(pattern=>pattern.test(decoded));
}
const findings=[];
const entries=git('rev-list','--objects','--all').toString('utf8').trim().split('\n').filter(Boolean).map(line=>{const [oid,...path]=line.split(' ');return {oid,path:path.join(' ')};});
const batch=spawnSync('git',['cat-file','--batch'],{input:entries.map(e=>e.oid).join('\n')+'\n',maxBuffer:64*1024*1024});
if(batch.status!==0)throw new Error('Cannot read history objects');
let offset=0,blobs=0;
for(const entry of entries){
  const end=batch.stdout.indexOf(10,offset),header=batch.stdout.subarray(offset,end).toString().split(' '),size=Number(header[2]);
  const data=batch.stdout.subarray(end+1,end+1+size);offset=end+size+2;
  if(header[1]!=='blob')continue;blobs++;
  if(/(^|\/)(?:\.env(?:\..*)?|\.local|node_modules|target|dist)(\/|$)/.test(entry.path)&&!entry.path.endsWith('.env.example'))findings.push(`${entry.path}: forbidden history path`);
  if(sensitive(data))findings.push(`${entry.path}: credential in history`);
}
const workingPaths=new Set([...git('ls-files','-z').toString('utf8').split('\0'),...git('ls-files','--others','--exclude-standard','-z').toString('utf8').split('\0')].filter(Boolean));
for(const path of workingPaths){
  if(!existsSync(path))continue;
  const data=readFileSync(path);
  if(sensitive(data))findings.push(`${path}: credential in worktree`);
}
let evidenceFiles=0;
function scanEvidence(dir){
  if(!existsSync(dir))return;
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const path=`${dir}/${entry.name}`;
    if(entry.isDirectory()){if(!['.git','node_modules','python'].includes(entry.name))scanEvidence(path);continue;}
    if(!entry.isFile()||!/[.](log|json|xml|txt)$/i.test(entry.name))continue;
    const data=readFileSync(path);evidenceFiles++;
    if(sensitive(data))findings.push(`${path}: credential in local evidence`);
  }
}
for(const dir of ['.local','backend/target'])scanEvidence(dir);
if(findings.length){console.error([...new Set(findings)].join('\n'));process.exit(1);}
const report={status:'PASS',commits:Number(git('rev-list','--count','--all').toString().trim()),historyBlobs:blobs,knownLocalCredentials:secrets.length,evidenceFiles,checks:['all reachable Git blobs','tracked and nonignored untracked working files','recursive local text evidence excluding clones/runtime packages','forbidden history paths','local credential exact matches','private keys and common access-token patterns'],limitation:'Pattern and known-value checks do not prove absence of every possible secret. Ignored logs and screenshots are excluded from Git and Docker contexts.'};
writeFileSync('.local/release-security.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
