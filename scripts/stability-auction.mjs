import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated')throw Error('Isolated test backend required');
const users=Number(process.argv.find(v=>v.startsWith('--users='))?.split('=')[1]);
const seconds=Number(process.argv.find(v=>v.startsWith('--seconds='))?.split('=')[1]);
assert.ok([20,50,100].includes(users)&&Number.isSafeInteger(seconds)&&seconds>=30&&seconds<=3600);
const base=process.env.API_BASE_URL,run=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const file=`target/stability-${users}.json`,records=[],samples=[],resources=[],rooms=[];
let measuring=false,timeouts=0,failed=false,monitor;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function save(status,error){writeFileSync(file,JSON.stringify({status,users,requestedSeconds:seconds,error,records,samples,resources,rooms},null,2));}
process.on('uncaughtException',e=>{save('FAIL',e.message);console.error(e);process.exit(1);});
process.on('unhandledRejection',e=>{save('FAIL',e.message);console.error(e);process.exit(1);});
async function call(path,token,body,expected=200){
 const start=performance.now();let response,data;
 try{response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});data=await response.json();}
 catch(e){if(e.name==='TimeoutError')timeouts++;throw e;}
 if(measuring)records.push({ms:performance.now()-start,status:response.status,type:data.type,error:data.error});
 assert.equal(response.status,expected,path+' '+data.error);return data;
}
const admin=(await call('/auth/login',null,{email:'admin@example.com',password:'Admin123456!'})).token;
await call('/admin/metrics',null,undefined,401);
const cors=await fetch(base+'/admin/metrics',{headers:{Origin:'https://untrusted.example.test'}});
assert.equal(cors.status,401);assert.equal(cors.headers.get('access-control-allow-origin'),null);await cors.arrayBuffer();
const preflight=await fetch(base+'/admin/metrics',{method:'OPTIONS',headers:{Origin:'https://untrusted.example.test','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});
assert.equal(preflight.headers.get('access-control-allow-origin'),null);await preflight.arrayBuffer();
const people=[];for(let i=0;i<users;i++){const email=`stable-${run}-${i}@example.test`;const u=await call('/admin/users',admin,{email,password,kind:'HUMAN'});u.token=(await call('/auth/login',null,{email,password})).token;people.push(u);}
await call('/admin/metrics',people[0].token,undefined,403);
const before=await call('/admin/metrics',admin);let sampling=false;
async function sample(){if(sampling)return;sampling=true;try{
 const m=await call('/admin/metrics',admin);samples.push({at:Date.now(),...m});
 assert.ok(m.heapUsedBytes<1024**3,'stop: heap > 1 GiB');
 for(const key of ['connection.acquireTimeouts','bid.systemErrors','http.systemErrors'])assert.equal(m.metrics[key]??0,before.metrics[key]??0,`stop: ${key}`);
 const exec=promisify(execFile);const p=await exec('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${Number(process.env.STRESS_JAVA_PID)} | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress`],{timeout:5000});
 const java=JSON.parse(p.stdout);assert.ok(java.WorkingSet64<2*1024**3,'stop: process RSS > 2 GiB');
 const d=await exec('docker',['compose','stats','--no-stream','--format','{{json .}}','mysql'],{timeout:8000});
 resources.push({at:Date.now(),java,mysql:d.stdout.trim().split('\n').filter(Boolean).map(v=>JSON.parse(v))});
 }catch(e){failed=true;save('FAIL',e.message);throw e;}finally{sampling=false;}}
monitor=setInterval(()=>sample().catch(e=>{throw e;}),5000);monitor.unref();
const started=performance.now(),deadline=Date.now()+seconds*1000;measuring=true;let cycle=0,reconnects=0;
while(Date.now()<deadline&&!failed){
 const active=[];for(let r=0;r<2;r++){const room=await call('/admin/auctions',admin,{title:`stability-${run}-${cycle}-${r}`,durationSeconds:20});rooms.push(room.id);active.push(room.id);}
 await Promise.all(people.map(async(u,i)=>{await call(`/auctions/${active[0]}/join`,u.token,{});await call(`/auctions/${active[1]}/join`,u.token,{});}));
 for(const id of active)await call(`/admin/auctions/${id}/start`,admin,{});
 const until=Math.min(deadline,Date.now()+22000);
 await Promise.all(people.map(async(u,i)=>{
  let step=0;while(Date.now()<until&&!failed){const id=active[(i+step)%2],op=step%6;
   if(op===0){const body={requestId:`${run}-${cycle}-${i}-${id}`,amount:110+(i%6)*10};const b=await call(`/auctions/${id}/bids`,u.token,body);const replay=await call(`/auctions/${id}/bids`,u.token,body);assert.equal(replay.seq,b.seq);assert.equal(replay.replayed,true);}
   if(op===1){const w=await call('/wallets/me',u.token);assert.equal(w.user_id,u.id);assert.ok(w.total_balance>=w.frozen_balance&&w.available_balance>=0);assert.ok(w.transactions.every(t=>t.user_id===u.id));}
   if(op===2)await call(`/auctions/${id}/bids`,u.token);
   if(op===3){const e=await call(`/auctions/${id}/events?after=0`,u.token);assert.ok(e.events.every((v,j,all)=>v.auctionId===id&&(!j||v.seq>all[j-1].seq)));}
   if(op===4){await sleep(250);const s=await call(`/auctions/${id}`,u.token);assert.equal(s.id,id);reconnects++;}
   if(op===5){const b=await call(`/auctions/${id}/bids`,u.token,{requestId:`${run}-low-${cycle}-${i}-${step}`,amount:100});assert.equal(b.type,'BID_REJECTED');}
   step++;await sleep(1250);
  }
 }));cycle++;console.log(JSON.stringify({progress:'cycle',users,cycle,elapsedSeconds:(performance.now()-started)/1000,requests:records.length}));
}
const loadSeconds=(performance.now()-started)/1000;measuring=false;
for(const id of rooms){const stop=Date.now()+60000;let s;do{s=await call(`/auctions/${id}`,admin);if(s.status==='FINISHED')break;await sleep(250);}while(Date.now()<stop);assert.equal(s.status,'FINISHED');assert.equal(s.result.length,1);}
await Promise.all(people.map(async u=>assert.equal((await call('/wallets/me',u.token)).frozen_balance,0)));
clearInterval(monitor);while(sampling)await sleep(50);await sample();
const after=await call('/admin/metrics',admin),times=records.map(r=>r.ms).sort((a,b)=>a-b),pct=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)];
const summary={status:'PASS',users,requestedSeconds:seconds,loadSeconds,totalSeconds:(performance.now()-started)/1000,requests:records.length,httpSuccess:records.filter(r=>r.status===200).length,acceptedBidResponses:records.filter(r=>r.type==='BID_ACCEPTED').length,expectedBusinessRejections:records.filter(r=>r.type==='BID_REJECTED').length,httpErrors:records.filter(r=>r.status!==200).length,timeouts,requestsPerSecond:records.length/loadSeconds,p50ms:pct(.5),p95ms:pct(.95),p99ms:pct(.99),rooms:rooms.length,reconnects,maximumPoolWaiting:Math.max(0,...samples.map(s=>s.pool.waiting)),maximumPoolActive:Math.max(0,...samples.map(s=>s.pool.active)),before,after};
writeFileSync(file,JSON.stringify({summary,samples,resources},null,2));console.log(JSON.stringify(summary));
