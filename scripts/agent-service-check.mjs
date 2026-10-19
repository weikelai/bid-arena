import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,openSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';

if(!process.env.DB_URL?.includes('bid_arena_it_'))throw Error('Isolated test schema required');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),vault=resolve(root,'backend/target/agent-vault-'+randomBytes(6).toString('hex'));
mkdirSync(vault,{recursive:true});
async function port(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}
const apiPort=await port(),vaultPort=await port(),secondPort=await port(),proxyPort=await port();
const secret=randomBytes(32).toString('hex'),key=randomBytes(32).toString('hex'),base='http://127.0.0.1:'+apiPort+'/api/v1';
const procs=[],tokens=[];let backend,w1,w2,dropNext=false,reject429=false,delayNext=false,bidsSent=0;
function boot(command,args,env,file){const fd=openSync(resolve(root,'backend/target/'+file),'a');const p=spawn(command,args,{cwd:resolve(root,'backend'),env:{...process.env,...env},stdio:['ignore',fd,fd]});procs.push(p);return p;}
function bootBackend(){return boot(process.env.JAVA_BINARY,['-jar','target/bid-arena.jar'],{BACKEND_PORT:String(apiPort),AGENT_CONTROL_SECRET:secret,AGENT_WORKER_URL:'http://127.0.0.1:'+vaultPort},'agent-test-backend.log');}
function bootWorker(p){return boot(process.execPath,[resolve(root,'agent-worker/worker.mjs')],{AGENT_API_URL:'http://127.0.0.1:'+proxyPort+'/api/v1',AGENT_ALLOW_PRIVATE_HTTP:'true',AGENT_PORT:String(p),AGENT_BIND:'127.0.0.1',AGENT_CONTROL_SECRET:secret,AGENT_VAULT_KEY:key,AGENT_VAULT_DIR:vault},'agent-test-worker.log');}
async function kill(p){if(p&&p.exitCode===null){p.kill();await Promise.race([new Promise(r=>p.once('exit',r)),sleep(5000)]);}}
async function until(fn,label,ms=25000){const deadline=Date.now()+ms;while(Date.now()<deadline){try{const x=await fn();if(x)return x;}catch{}await sleep(150);}throw Error('Timed out: '+label);}
async function req(path,token,body,status=200){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});assert.equal(r.status,status,'HTTP status '+path);return r.json();}
let checks=0;function pass(label){checks++;console.log('PASS '+checks+' '+label);}
const proxy=http.createServer(async(q,s)=>{try{if(reject429&&q.url.match(/\/auctions\/\d+$/)){s.writeHead(429,{'Content-Type':'application/json'});s.end('{"error":"RATE_LIMITED"}');return;}
 const chunks=[];for await(const c of q)chunks.push(c);const isBid=q.url.endsWith('/bids')&&q.method==='POST';if(isBid)bidsSent++;
 const r=await fetch('http://127.0.0.1:'+apiPort+q.url,{method:q.method,headers:{Authorization:q.headers.authorization??'','Content-Type':'application/json'},body:q.method==='POST'?Buffer.concat(chunks):undefined,signal:AbortSignal.timeout(12000)});
 const data=await r.text();if(!r.ok)console.log('PROXY_STATUS '+r.status+' '+q.url);if(isBid&&delayNext){delayNext=false;await sleep(1800);}if(isBid&&dropNext){dropNext=false;s.destroy();return;}s.writeHead(r.status,{'Content-Type':'application/json'});s.end(data);
 }catch{s.writeHead(503);s.end('{}');}});
await new Promise(r=>proxy.listen(proxyPort,'127.0.0.1',r));
try{
 backend=bootBackend();await until(async()=> (await fetch(base+'/health')).ok,'backend health');
 w1=bootWorker(vaultPort);w2=bootWorker(secondPort);await until(async()=> (await fetch('http://127.0.0.1:'+vaultPort+'/health')).ok,'worker health');
 const admin=(await req('/auth/login','',{email:'admin@example.com',password:'Admin123456!'})).token;
 const human=(await req('/auth/login','',{email:'bidder_a@example.com',password:'Test123456!'})).token;
 const createAuction=async(seconds=180)=>(await req('/admin/auctions',admin,{title:'Agent isolated service acceptance',durationSeconds:seconds})).id;
 async function setup(auction,options={}){
  const u=await req('/admin/users',admin,{email:'agent-'+randomBytes(6).toString('hex')+'@example.com',password:randomBytes(16).toString('hex'),kind:'AGENT'});
  const issued=await req('/admin/agent-tokens',admin,{userId:u.id,auctionId:auction,permissions:['auction:read','auction:bid'],expiresInSeconds:options.expires??3600,rateLimit:120});tokens.push(issued.token);
  const job=await req('/admin/agent-jobs',admin,{name:'Isolated service',userId:u.id,auctionId:auction,token:issued.token,maxBidAmount:options.max??200,maxBids:options.count??10,timeoutMs:1000,maxErrors:3});
  return {...job,token:issued.token,user:u.id,auction};
 }
 const jobs=()=>req('/admin/agent-jobs',admin);
 const job=async id=>(await jobs()).find(j=>j.id===id);
 const ctl=(id,action,b={})=>req('/admin/agent-jobs/'+id+'/'+action,admin,b);
 const room=a=>req('/auctions/'+a,admin);
 const wizard=async(auction,options={})=>{
  const payload={requestId:randomUUID(),name:'One click isolated',auctionId:auction,maxBidAmount:200,maxBids:5,strategy:'BALANCED',...options};
  const out=await req('/admin/agent-launch',admin,payload);assert.deepEqual(Object.keys(out).sort(),['id','replayed']);
  return {...out,user:(await job(out.id)).user_id,payload};
 };
 const rollbackAuction=await createAuction(),rollbackPayload={requestId:randomUUID(),name:'Forced SQL failure',auctionId:rollbackAuction,maxBidAmount:200,maxBids:5,strategy:'BALANCED'};
 const filesBefore=readdirSync(vault).sort();const jobsBefore=(await jobs()).length;
 await req('/admin/agent-launch',admin,rollbackPayload,500);
 assert.equal((await jobs()).length,jobsBefore);assert.deepEqual(readdirSync(vault).sort(),filesBefore);
 const rollbackRetry=await req('/admin/agent-launch',admin,{...rollbackPayload,name:'Recovered provisioning'});await ctl(rollbackRetry.id,'revoke');
 await req('/admin/auctions/'+rollbackAuction+'/cancel',admin,{});
 pass('Real SQL failure after vault delivery rolls back provisioning and removes orphan ciphertext; same request can retry');
 const wa=await createAuction(),payload={requestId:randomUUID(),name:'Concurrent wizard',auctionId:wa,maxBidAmount:300,maxBids:10,strategy:'BALANCED'};
 payload.maxBidAmount=300;
 await req('/admin/agent-launch',human,payload,403);
 await req('/admin/agent-launch',admin,{...payload,strategy:'INVALID'},400);
 await req('/admin/agent-launch',admin,{...payload,maxBidAmount:1001},400);
 payload.maxBidAmount=300;
 const initialJobs=(await jobs()).length;
 const copies=await Promise.all(Array.from({length:6},()=>req('/admin/agent-launch',admin,payload)));
 assert.equal(new Set(copies.map(j=>j.id)).size,1);assert.equal((await jobs()).length,initialJobs+1);assert.equal(copies.filter(j=>!j.replayed).length,1);
 for(const response of copies)assert.deepEqual(Object.keys(response).sort(),['id','replayed']);
 await req('/admin/agent-launch',admin,{...payload,maxBidAmount:310},409);
 const wid=copies[0].id;await until(async()=> (await job(wid)).last_result==='DRAFT','wizard DRAFT');
 const confirmed=await job(wid);assert.equal(confirmed.state,'WAITING');assert.equal((await room(wa)).status,'DRAFT');assert.equal(confirmed.bid_count,0);
 await Promise.all(Array.from({length:5},()=>ctl(wid,'start')));assert.equal((await job(wid)).bid_count,0);assert.equal((await jobs()).filter(j=>j.id===wid).length,1);
 await ctl(wid,'pause');assert.equal((await job(wid)).state,'PAUSED');await ctl(wid,'start');await until(async()=> (await job(wid)).last_result==='DRAFT','wizard resume');
 await ctl(wid,'stop');assert.equal((await job(wid)).state,'STOPPED');await ctl(wid,'start');
 await req('/admin/auctions/'+wa+'/cancel',admin,{});await until(async()=> (await job(wid)).state==='FINISHED','wizard terminal');
 await req('/admin/agent-jobs/'+wid+'/start',admin,{},409);
 pass('Wizard concurrent create is idempotent, no credentials returned; repeat start, pause, resume, stop and terminal are authoritative');
 const ma=await createAuction(),monitor=await wizard(ma,{strategy:'MONITOR'});await req('/admin/auctions/'+ma+'/start',admin,{});
 await until(async()=> (await job(monitor.id)).last_result==='MONITOR_ONLY','read-only monitoring');assert.equal((await req('/auctions/'+ma+'/bids',admin)).length,0);
 await req('/admin/auctions/'+ma+'/cancel',admin,{});await until(async()=> (await job(monitor.id)).state==='FINISHED','monitor final');
 const ca=await createAuction(),conservative=await wizard(ca,{strategy:'CONSERVATIVE'});assert.equal((await job(conservative.id)).poll_ms,10000);
 await req('/admin/auctions/'+ca+'/cancel',admin,{});await until(async()=> (await job(conservative.id)).state==='FINISHED','conservative final');
 pass('Monitor strategy submits no bids; conservative uses bounded slower polling; terminal stops both');
 const fa=await createAuction(),failedPayload={requestId:randomUUID(),name:'Unavailable vault retry',auctionId:fa,maxBidAmount:200,maxBids:5,strategy:'BALANCED'};
 await kill(w1);const countBefore=(await jobs()).length;await req('/admin/agent-launch',admin,failedPayload,503);assert.equal((await jobs()).length,countBefore);
 w1=bootWorker(vaultPort);await until(async()=> (await fetch('http://127.0.0.1:'+vaultPort+'/health')).ok,'vault restart');
 const recovered=await req('/admin/agent-launch',admin,failedPayload);await ctl(recovered.id,'revoke');assert.equal((await job(recovered.id)).state,'STOPPED');
 await req('/admin/auctions/'+fa+'/cancel',admin,{});pass('Unavailable Worker rolls provisioning back; same request succeeds after restart and can be revoked');
 const a=await createAuction(),j=await setup(a,{max:150,count:3});
 await ctl(j.id,'start');await until(async()=> (await job(j.id)).last_result==='DRAFT','DRAFT wait');assert.equal((await room(a)).status,'DRAFT');assert.equal((await req('/auctions/'+a+'/bids',admin)).length,0);pass('DRAFT monitored without start or bid');
 await req('/admin/auctions/'+a+'/start',admin,{});await until(async()=> (await room(a)).leader_id===j.user,'automatic join and bid');assert.equal((await room(a)).current_price,110);pass('RUNNING automatically joined and bid within budget');
 await sleep(6500);assert.equal((await req('/auctions/'+a+'/bids',admin)).length,1);pass('Two Workers do not self-raise or create duplicate loops');
 await req('/auctions/'+a+'/join',human,{});await req('/auctions/'+a+'/bids',human,{requestId:'human-120',amount:120});await until(async()=> (await room(a)).current_price===130,'outbid recovery');pass('Agent reconsiders after being outbid');
 await ctl(j.id,'pause');await req('/auctions/'+a+'/bids',human,{requestId:'human-140',amount:140});await sleep(6500);assert.equal((await room(a)).current_price,140);assert.equal((await job(j.id)).state,'PAUSED');pass('Pause blocks new submissions');
 await ctl(j.id,'configure',{maxBidAmount:130,maxBids:3});await ctl(j.id,'start');await until(async()=> (await job(j.id)).last_result==='BUDGET_MONITOR_ONLY','budget limit');assert.equal((await room(a)).current_price,140);pass('Budget exhausted: monitor only');
 await ctl(j.id,'pause');await ctl(j.id,'configure',{maxBidAmount:200,maxBids:3});await ctl(j.id,'start');await until(async()=> (await room(a)).current_price===150,'resumed bid');await req('/auctions/'+a+'/bids',human,{requestId:'human-160',amount:160});await until(async()=> (await job(j.id)).last_result==='MAX_BIDS_MONITOR_ONLY','max requests');pass('Stopped strategy update, resume and max bid-count enforced');
 const before=(await req('/auctions/'+a+'/bids',admin)).length;
 assert.equal((await req('/auctions/'+a+'/bids',j.token,{requestId:'agent:'+j.id+':1',amount:110})).replayed,true);await req('/auctions/'+a+'/bids',j.token,{requestId:'agent:'+j.id+':1',amount:120},409);assert.equal((await req('/auctions/'+a+'/bids',admin)).length,before);pass('Same requestId replays without another bid; changed amount is rejected');
 await req('/admin/auctions/'+a+'/cancel',admin,{});await until(async()=> (await job(j.id)).state==='FINISHED','cancel stop');pass('CANCELLED stops monitoring and records authoritative result');
 const other=await createAuction();await req('/admin/auctions/'+other+'/start',j.token,{},403);await req('/wallets/me',j.token,undefined,403);await req('/auctions/'+other,j.token,undefined,403);await req('/admin/agent-jobs',human,undefined,403);pass('Agent cannot administer, read private wallet or unauthorized auction');
 const r=await setup(other);await ctl(r.id,'start');await until(async()=> (await job(r.id)).last_result==='DRAFT','revoke waiting');await ctl(r.id,'revoke');assert.equal((await job(r.id)).state,'STOPPED');await req('/auctions/'+other,r.token,undefined,401);pass('Revocation blocks protected calls and task stops');
 const exp=await setup(other,{expires:2});await sleep(2500);await req('/admin/agent-jobs/'+exp.id+'/start',admin,{},409);assert.equal((await job(exp.id)).state,'STOPPED');pass('Expired Token cannot restart a task');
 const b=await createAuction(6);reject429=true;const k=await wizard(b);await until(async()=> (await job(k.id)).last_error==='HTTP_429','429 backoff');assert.equal((await room(b)).status,'DRAFT');assert.equal((await job(k.id)).pending_id??null,null);reject429=false;await ctl(k.id,'pause');await ctl(k.id,'start');pass('429 bounded backoff leaves funds untouched');
 // Simulate a lost response after the real backend has committed, then crash both Workers.
 dropNext=true;await req('/admin/auctions/'+b+'/start',admin,{});await until(async()=> (await job(k.id)).pending_id,'persisted pending');await until(async()=> (await room(b)).current_price===110,'committed lost response');await kill(w1);await kill(w2);
 backend.kill();await new Promise(r=>backend.once('exit',r));backend=bootBackend();await until(async()=> (await fetch(base+'/health')).ok,'backend restart');
 w1=bootWorker(vaultPort);w2=bootWorker(secondPort);await until(async()=> !(await job(k.id)).pending_id,'restart pending receipt',80000);
 assert.equal((await req('/auctions/'+b+'/bids',admin)).length,1);pass('Lost committed response, backend and two Worker restarts recover same request');
 await until(async()=> (await room(b)).status==='FINISHED','automatic settlement',50000);await until(async()=> (await job(k.id)).state==='FINISHED','worker final result');assert.equal((await room(b)).result[0].winner_id,k.user);pass('FINISHED uses server result and never resumes bidding after restart');
 const timedAuction=await createAuction(),timed=await setup(timedAuction);delayNext=true;await ctl(timed.id,'start');await req('/admin/auctions/'+timedAuction+'/start',admin,{});
 await until(async()=> (await job(timed.id)).last_result==='PENDING_RECOVERY','actual HTTP timeout');await until(async()=> !(await job(timed.id)).pending_id,'timeout recovery');assert.equal((await req('/auctions/'+timedAuction+'/bids',admin)).length,1);await req('/admin/auctions/'+timedAuction+'/cancel',admin,{});await until(async()=> (await job(timed.id)).state==='FINISHED','timeout job finished');pass('Real request timeout after commit recovers receipt with one business effect');
 // Create a prepared but unsent request; stop fences an old authenticated sender.
 const c=await createAuction(),f=await setup(c);await kill(w1);await kill(w2);await ctl(f.id,'start');
 const internal=async(path,body)=>{const res=await fetch(base+'/internal/agent-jobs/'+path,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(res.status,200);return res.json();};
 const owner='deterministic-test-owner',claim=await internal('claim',{owner});assert.equal(claim.id,f.id);const identity={owner,epoch:claim.lease_epoch};const stale=await fetch(base+'/internal/agent-jobs/'+f.id+'/prepare',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({...identity,epoch:claim.lease_epoch-1,amount:110})});assert.equal(stale.status,409);const pending=await internal(f.id+'/prepare',{...identity,amount:110});
 await ctl(f.id,'stop');assert.equal((await job(f.id)).state,'STOPPING');const receipt=await internal(f.id+'/recover',identity);assert.equal(receipt.detail,'FENCED_NO_EFFECT');
 await req('/auctions/'+c+'/bids',f.token,pending,409);await internal(f.id+'/report',{...identity,state:'STOPPED',detail:receipt.detail,resolved:true,requestId:pending.requestId});assert.equal((await job(f.id)).state,'STOPPED');assert.equal((await req('/auctions/'+c+'/bids',admin)).length,0);pass('Stop fences prepared unsent request and clears only a determined result');
 w1=bootWorker(vaultPort);w2=bootWorker(secondPort);
 const browser=spawn(process.execPath,['agent-browser-check.mjs'],{cwd:resolve(root,'frontend'),env:{...process.env,API_BASE_URL:base,SIMULATION_ALLOW_MUTATION:'isolated'},stdio:['ignore',openSync(resolve(root,'backend/target/agent-browser-check.log'),'w'),'inherit']});procs.push(browser);
 assert.equal(await new Promise(r=>browser.once('exit',r)),0,'Agent browser: target/agent-browser-check.log');pass('Administrator and two human browser sessions bid alongside independent Worker');
 const metadata=JSON.stringify(await jobs())+JSON.stringify(await req('/admin/agent-jobs/'+j.id+'/history',admin));for(const t of tokens){assert.ok(!metadata.includes(t));for(const file of readdirSync(vault))assert.ok(!readFileSync(resolve(vault,file)).includes(Buffer.from(t)));}
 for(const file of ['agent-test-worker.log','agent-test-backend.log']){const logs=readFileSync(resolve(root,'backend/target/'+file),'utf8');for(const t of tokens)assert.ok(!logs.includes(t));assert.ok(!logs.includes(secret));}pass('Metadata, decision history, logs and encrypted vault omit plaintext tokens');
 assert.ok(bidsSent>=5);console.log('AGENT_SERVICE_RESULT '+JSON.stringify({checks,failed:0,workers:2,transport:'real HTTP',database:'isolated real MySQL',at:new Date().toISOString()}));
}finally{for(const p of procs)await kill(p);await new Promise(r=>proxy.close(r));}
