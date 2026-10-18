import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,readFileSync,utimesSync} from 'node:fs';
import assert from 'node:assert/strict';
let unhealthy=false,failures=false,limitedOnly=false;const token=randomBytes(32).toString('hex'),file='.local/ops-freshness-probe-'+randomBytes(5).toString('hex');writeFileSync(file,'freshness probe only, not a database backup');
const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url.endsWith('/health')){res.statusCode=unhealthy?503:200;res.end(JSON.stringify({status:unhealthy?'DOWN':'UP'}));}else if(req.headers.authorization==='Bearer '+token)res.end(JSON.stringify({pool:{waiting:failures?1:0},metrics:{'auth.loginFailures':failures?21:0,'auth.rateLimited':failures||limitedOnly?11:0,'settlement.failures':failures?1:0}}));else{res.statusCode=401;res.end('{}');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
function probe(){return new Promise((resolve,reject)=>{const p=spawn('node',['scripts/ops-check.mjs'],{env:{...process.env,OPS_API_BASE:`http://127.0.0.1:${port}/api/v1`,OPS_TOKEN:token,OPS_BACKUP_FILE:file},stdio:'ignore'});p.on('error',reject);p.on('exit',code=>resolve({code,...JSON.parse(readFileSync('.local/ops-check.json','utf8'))}));});}
try{
 const normal=await probe();assert.equal(normal.code,0);assert.deepEqual(normal.alerts,[]);assert.ok(normal.unverified.includes('EXTERNAL_ALERT_DELIVERY'));
 unhealthy=true;failures=true;utimesSync(file,new Date(0),new Date(0));const bad=await probe();assert.equal(bad.code,1);for(const name of ['HEALTH_DOWN','POOL_WAITING','AUTH_LOGINFAILURES','AUTH_RATELIMITED','SETTLEMENT_FAILURES','BACKUP_STALE'])assert.ok(bad.alerts.includes(name),name);
 unhealthy=false;failures=false;limitedOnly=true;utimesSync(file,new Date(),new Date());const limited=await probe();assert.equal(limited.code,1);assert.deepEqual(limited.alerts,['AUTH_RATELIMITED'],'Rate-limited attacks must alert even when failed-password count stays below threshold');
 const report={status:'PASS',checks:['healthy probe returns no alerts but external delivery remains NOT VERIFIED','503 health, pool waiting, login failures, settlement failures and stale backup generate alerts and exit1','rate-limited attempts independently alert before failed-password threshold'],limitation:'Controlled synthetic probe fixtures; no real monitoring destination, retention scheduler or production backup is configured.'};writeFileSync('.local/ops-probe-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await new Promise(r=>server.close(r));}
