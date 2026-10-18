import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {request} from 'node:https';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const cert=readdirSync('.local').filter(n=>n.startsWith('tls-')).sort((a,b)=>statSync('.local/'+a).mtimeMs-statSync('.local/'+b).mtimeMs).at(-1);
if(!cert)throw Error('Run test-local-tls.mjs first');
const suffix=randomBytes(5).toString('hex'),project='bid-arena-prodtest-'+suffix;
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const secret=()=>randomBytes(32).toString('hex');
const env={...process.env,PRODUCTION_PROJECT:project,PROD_DB_NAME:'bid_arena_prodtest_'+suffix,PROD_ROOT_PASSWORD:secret(),PROD_MIGRATION_USER:'migration_'+suffix,PROD_MIGRATION_PASSWORD:secret(),PROD_RUNTIME_USER:'runtime_'+suffix,PROD_RUNTIME_PASSWORD:secret(),TLS_DIRECTORY:resolve('.local',cert),HTTPS_PORT:String(port)};
function compose(args,input){const r=spawnSync('docker',['compose','-p',project,'-f','compose.production.yaml',...args],{env,input,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0){writeFileSync('.local/production-compose-failure.log',(r.stderr??'').replaceAll(env.PROD_ROOT_PASSWORD,'[redacted]').replaceAll(env.PROD_MIGRATION_PASSWORD,'[redacted]').replaceAll(env.PROD_RUNTIME_PASSWORD,'[redacted]'));throw Error('Production Compose '+args[0]+' failed (exit '+r.status+')');}return r.stdout;}
function https(path,token,data){return new Promise((resolve,reject)=>{const r=request({host:'127.0.0.1',port,path:'/api/v1'+path,servername:'localhost',ca:readFileSync(env.TLS_DIRECTORY+'/ca.pem'),method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},timeout:10000},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,body}));});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('timeout')));r.end(data?JSON.stringify(data):undefined);});}
let started=false;
try {
 compose(['config','--quiet']);compose(['up','-d','--wait','mysql']);started=true;
 const p=spawnSync('node',['scripts/provision-production.mjs'],{env,encoding:'utf8'});assert.equal(p.status,0,'provision dedicated identities');
 compose(['--profile','ops','run','--rm','-T','migrate']);
 const grants=spawnSync('node',['scripts/provision-production.mjs','--runtime'],{env,encoding:'utf8'});assert.equal(grants.status,0,'grant only runtime table operations after migration');
 for(const statement of ['CREATE TABLE forbidden(id INT);','DELETE FROM wallet_transactions WHERE 1=0;','UPDATE wallet_transactions SET delta_total=0 WHERE 1=0;','UPDATE bids SET amount=0 WHERE 1=0;','UPDATE auction_results SET price=0 WHERE 1=0;','UPDATE auction_events SET type=type WHERE 1=0;','UPDATE security_audit SET type=type WHERE 1=0;','UPDATE security_bootstrap SET digest=NULL WHERE 1=0;','SELECT * FROM mysql.user LIMIT 0;']){
  const denied=spawnSync('docker',['compose','-p',project,'-f','compose.production.yaml','exec','-T','mysql','sh','-c','IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -u"$1" "$2"','sh',env.PROD_RUNTIME_USER,env.PROD_DB_NAME],{env,input:env.PROD_RUNTIME_PASSWORD+'\n'+statement,encoding:'utf8'});
  assert.notEqual(denied.status,0,'Runtime privilege must reject '+statement);assert.match(denied.stderr,/denied/i);
 }
 const prepared=compose(['--profile','ops','run','--rm','-T','migrate','prepare-admin-bootstrap']).trim().split(/\r?\n/).at(-1);assert.match(prepared,/^[A-Za-z0-9_-]{43}$/);
 const password=secret();compose(['--profile','ops','run','--rm','-T','migrate','consume-admin-bootstrap'],prepared+'\nowner@example.test\n'+password+'\n');
 compose(['up','-d','--wait','backend','frontend','ingress']);
 const runtimeId=compose(['ps','-q','backend']).trim();const inspected=spawnSync('docker',['inspect',runtimeId],{encoding:'utf8'});assert.equal(inspected.status,0);const config=JSON.parse(inspected.stdout)[0];assert.ok(config.Config.Env.every(v=>!v.startsWith('MIGRATION_DB_')));assert.equal(Object.keys(config.HostConfig.PortBindings??{}).length,0);
 // Compose --wait cannot establish readiness for an entrypoint without a
 // healthcheck. Bound only initial connection readiness; never retry business
 // requests or suppress TLS verification failures and assertion failures.
 let health;const readiness=[];
 for(let i=0;i<30;i++){
  try{health=await https('/health');readiness.push({attempt:i+1,status:health.status});if(health.status===200)break;}
  catch(error){if(!['ECONNREFUSED','ECONNRESET'].includes(error.code))throw error;readiness.push({attempt:i+1,code:error.code});}
  await new Promise(r=>setTimeout(r,1000));
 }
 writeFileSync('.local/production-compose-readiness.json',JSON.stringify(readiness,null,2));
 assert.equal(health?.status,200,'TLS entrypoint must become healthy within the bounded startup window');
 let r=await https('/auth/login',null,{email:'owner@example.test',password});assert.equal(r.status,200);const token=JSON.parse(r.body).token;
 const users=await https('/users/me',token);assert.equal(JSON.parse(users.body).role,'ADMIN');
 assert.equal(JSON.parse((await https('/auctions',token)).body).length,0,'no demo auction');
 assert.equal(JSON.parse((await https('/wallets/me',token)).body).total_balance,0,'no public seed credit');
 const bidderPassword=secret();r=await https('/admin/users',token,{email:'bidder@example.test',password:bidderPassword,kind:'HUMAN'});assert.equal(r.status,200);
 r=await https('/auth/login',null,{email:'bidder@example.test',password:bidderPassword});assert.equal(r.status,200);const bidder=JSON.parse(r.body).token;
 const secondPassword=secret();r=await https('/admin/users',token,{email:'second@example.test',password:secondPassword,kind:'HUMAN'});assert.equal(r.status,200);
 const second=JSON.parse((await https('/auth/login',null,{email:'second@example.test',password:secondPassword})).body).token;
 const auction=JSON.parse((await https('/admin/auctions',token,{title:'Runtime privilege test',durationSeconds:3})).body).id;
 assert.equal((await https('/auctions/'+auction+'/join',bidder,{})).status,200);assert.equal((await https('/admin/auctions/'+auction+'/start',token,{})).status,200);
 r=await https('/auctions/'+auction+'/bids',bidder,{requestId:'production-runtime-test',amount:110});assert.equal(r.status,200,'runtime bid HTTP status');assert.equal(JSON.parse(r.body).type,'BID_ACCEPTED');
 assert.equal(JSON.parse((await https('/wallets/me',bidder)).body).frozen_balance,110);
 assert.equal((await https('/auctions/'+auction+'/join',second,{})).status,200);
 r=await https('/auctions/'+auction+'/bids',second,{requestId:'production-runtime-second',amount:120});assert.equal(JSON.parse(r.body).type,'BID_ACCEPTED');
 assert.equal(JSON.parse((await https('/wallets/me',bidder)).body).frozen_balance,0,'previous leader released');
 r=await https('/auctions/'+auction+'/bids',second,{requestId:'production-runtime-delta',amount:130});assert.equal(JSON.parse(r.body).type,'BID_ACCEPTED');
 assert.equal(JSON.parse((await https('/wallets/me',second)).body).frozen_balance,130,'same leader freezes only delta');
 await new Promise(r=>setTimeout(r,35000));
 const settled=JSON.parse((await https('/auctions/'+auction,token)).body);assert.equal(settled.status,'FINISHED');assert.equal(settled.result.length,1);
 const wallet=JSON.parse((await https('/wallets/me',second)).body);assert.equal(wallet.total_balance,870);assert.equal(wallet.frozen_balance,0);
 assert.equal(JSON.parse((await https('/wallets/me',bidder)).body).total_balance,1000);
 const cancelled=JSON.parse((await https('/admin/auctions',token,{title:'Runtime cancellation',durationSeconds:180})).body).id;
 await https('/auctions/'+cancelled+'/join',bidder,{});await https('/admin/auctions/'+cancelled+'/start',token,{});
 r=await https('/auctions/'+cancelled+'/bids',bidder,{requestId:'production-runtime-cancel',amount:110});assert.equal(JSON.parse(r.body).type,'BID_ACCEPTED');
 assert.equal((await https('/admin/auctions/'+cancelled+'/cancel',token,{})).status,200);
 assert.equal(JSON.parse((await https('/wallets/me',bidder)).body).frozen_balance,0);
 // Snapshot immutable money facts before a graceful full project stop/restart.
 function moneyFacts(){return compose(['exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE" -N -B'],`SELECT user_id,total_balance,frozen_balance FROM wallets ORDER BY user_id;
 SELECT id,auction_id,type,delta_total,delta_frozen FROM wallet_transactions ORDER BY id;
 SELECT auction_id,winner_id,price,reason FROM auction_results ORDER BY auction_id;
 SELECT id,amount FROM bids ORDER BY id;`);}
 const beforeRestart=moneyFacts();
 compose(['stop']);compose(['up','-d','--wait']);
 let restored;
 for(let i=0;i<30;i++){try{restored=await https('/health');if(restored.status===200)break;}catch(e){if(!['ECONNREFUSED','ECONNRESET'].includes(e.code))throw e;}await new Promise(r=>setTimeout(r,1000));}
 assert.equal(restored?.status,200,'healthy after graceful stop/restart');
 await new Promise(r=>setTimeout(r,3000));
 assert.equal(moneyFacts(),beforeRestart,'persistent money facts and unique settlement unchanged across restart/scanner reruns');
 const reconciliation=compose(['exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE" -N -B'],`SELECT COUNT(*) FROM wallets w WHERE w.total_balance<>COALESCE((SELECT SUM(t.delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id),0) OR w.frozen_balance<>COALESCE((SELECT SUM(t.delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id),0) OR w.total_balance<0 OR w.frozen_balance<0 OR w.total_balance<w.frozen_balance;
 SELECT COUNT(*) FROM (SELECT auction_id FROM auction_results GROUP BY auction_id HAVING COUNT(*)>1) duplicated;
 SELECT COUNT(*) FROM auction_results WHERE reason='SOLD';`);
 assert.deepEqual(reconciliation.trim().split(/\s+/),['0','0','1'],'zero ledger/wallet discrepancies, unique result and exactly one sale');
 writeFileSync('.local/production-lifecycle-result.json',JSON.stringify({at:new Date().toISOString(),status:'PASS',project,checks:['graceful stop and full restart','wallet/ledger/bid/result persistence','no duplicate automatic settlement after restart','SQL wallet equals ledger totals and frozen deltas','exactly one sale'],sql:reconciliation.trim()},null,2));
 assert.equal((await https('/auth/logout',token,{})).status,200);assert.equal((await https('/users/me',token)).status,401);
 const report={status:'PASS',at:new Date().toISOString(),project,port,checks:['separate production project and volume','no mysql/backend host ports','migration identity separate from runtime','runtime cannot update/delete append-only ledger, bids, results, events or security audit','one-time CLI bootstrap through stdin','production runtime validates migrations without DDL','no demo auction or initial credits','trusted local TLS health/login/logout','two-leader release, same-leader delta freeze, unique automatic capture and cancellation release'],limits:'Local CA only. Volume retained, project stopped after test. Public deployment, renewal and external backup/alerts not verified.'};
 writeFileSync('.local/production-compose-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {if(started){
 // Keep test evidence and named database volumes, but do not exhaust Desktop's
 // address pools with networks belonging to this disposable test project.
 compose(['stop']);
 writeFileSync('.local/production-compose-lifecycle.log',compose(['logs','--no-color','--tail=200']));
 compose(['down']); // Deliberately no -v: retained isolated database is not reset.
}}
