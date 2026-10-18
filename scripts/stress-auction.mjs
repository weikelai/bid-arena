import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated')throw Error('Isolated backend required');
const count=Number(process.argv.find(a=>a.startsWith('--users='))?.split('=')[1]??20);
if(![20,50,100,200].includes(count))throw Error('Supported user counts: 20,50,100,200');
const base=process.env.API_BASE_URL,run=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
let measuring=false,timeouts=0;const records=[];
const samples=[];let sampling=false;
process.on('uncaughtException',error=>{writeFileSync(`target/stress-${count}-failure.json`,JSON.stringify({status:'FAIL',users:count,timeouts,error:error.message,records,samples},null,2));console.error(error);process.exit(1);});
async function sample(){if(sampling||!process.env.STRESS_JAVA_PID)return;sampling=true;try{const run=promisify(execFile);const {stdout}=await run('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${Number(process.env.STRESS_JAVA_PID)} | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress`],{timeout:5000});const java=JSON.parse(stdout);const docker=await run('docker',['compose','stats','--no-stream','--format','{{json .}}','mysql'],{timeout:8000});samples.push({at:Date.now(),javaCpuSeconds:java.CPU,javaRssBytes:java.WorkingSet64,mysql:docker.stdout.trim().split('\n').filter(Boolean).map(v=>JSON.parse(v))});}catch(e){samples.push({at:Date.now(),samplingError:e.code??e.name});}finally{sampling=false;}}
const monitor=setInterval(sample,2500);monitor.unref();await sample();
async function call(path,token,body,status=200){const start=performance.now();let response,data;try{response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});data=await response.json();}catch(e){if(e.name==='TimeoutError')timeouts++;throw e;}if(measuring)records.push({path,ms:performance.now()-start,status:response.status,type:data.type,error:data.error,requestId:body?.requestId,amount:body?.amount,seq:data.seq});assert.equal(response.status,status,path+' '+data.error);return data;}
async function parallel(items,work,limit=count){let index=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;await work(items[i],i);}}));}
const admin=(await call('/auth/login',null,{email:'admin@example.com',password:'Admin123456!'})).token;
const users=[];for(let i=0;i<count;i++){const email=`stress-${run}-${i}@example.test`;const u=await call('/admin/users',admin,{email,password,kind:'HUMAN'});users.push({...u,email});}
await parallel(users,async u=>u.token=(await call('/auth/login',null,{email:u.email,password})).token,16);
const auction=await call('/admin/auctions',admin,{title:`stress-${run}-${count}`,durationSeconds:15});
measuring=true;const started=performance.now();
await parallel(users,u=>call(`/auctions/${auction.id}/join`,u.token,{}));
await call(`/admin/auctions/${auction.id}/start`,admin,{});
await parallel(users,(u,i)=>call(`/auctions/${auction.id}/bids`,u.token,{requestId:`${run}-same-${i}`,amount:110}));
const same=records.filter(r=>r.requestId?.includes('-same-'));assert.equal(same.filter(r=>r.type==='BID_ACCEPTED').length,1);
await parallel(users,()=>call(`/auctions/${auction.id}/bids`,users[0].token,{requestId:`${run}-duplicate`,amount:120}));
await parallel(users,(u,i)=>call(`/auctions/${auction.id}/bids`,u.token,{requestId:`${run}-adjacent-${i}`,amount:130+(i%8)*10}));
await parallel(users,async(u,i)=>{assert.equal((await call(`/auctions/${auction.id}/bids`,u.token,{requestId:`${run}-low-${i}`,amount:100})).error,'BID_TOO_LOW');assert.equal((await call(`/auctions/${auction.id}/bids`,u.token,{requestId:`${run}-funds-${i}`,amount:1001})).error,'INSUFFICIENT_FUNDS');const w=await call('/wallets/me',u.token);assert.equal(w.user_id,u.id);assert.equal(w.total_balance,1000);assert.ok(w.frozen_balance>=0&&w.available_balance>=0);assert.ok(w.transactions.every(t=>t.user_id===u.id));await call(`/auctions/${auction.id}/bids`,u.token);const events=await call(`/auctions/${auction.id}/events?after=0`,u.token);assert.ok(events.events.every((e,j,all)=>e.auctionId===auction.id&&(!j||e.seq>all[j-1].seq)));});
const loadSeconds=(performance.now()-started)/1000;measuring=false;
let state;const deadline=Date.now()+65000;do{state=await call(`/auctions/${auction.id}`,admin);if(state.status==='FINISHED')break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<deadline);
assert.equal(state.status,'FINISHED');assert.equal(state.current_price,200);assert.equal(state.result.length,1);assert.equal(state.result[0].price,200);
await parallel(users,async u=>{const w=await call('/wallets/me',u.token);assert.equal(w.frozen_balance,0);assert.equal(w.total_balance,u.id===state.result[0].winner_id?800:1000);});
const latency=records.map(r=>r.ms).sort((a,b)=>a-b),percentile=p=>latency[Math.min(latency.length-1,Math.ceil(latency.length*p)-1)];
clearInterval(monitor);while(sampling)await new Promise(r=>setTimeout(r,100));await sample();
const valid=samples.filter(s=>s.javaRssBytes),cpu=valid.slice(1).map((s,i)=>100000*(s.javaCpuSeconds-valid[i].javaCpuSeconds)/(s.at-valid[i].at));
const summary={status:'PASS',users:count,maximumWorkers:count,auctionId:auction.id,requests:records.length,acceptedBidResponses:records.filter(r=>r.type==='BID_ACCEPTED').length,rejectedBidResponses:records.filter(r=>r.type==='BID_REJECTED').length,httpErrors:records.filter(r=>r.status>=400).length,timeouts,loadSeconds,requestsPerSecond:records.length/loadSeconds,p50ms:percentile(.5),p95ms:percentile(.95),p99ms:percentile(.99),winnerId:state.result[0].winner_id,price:200,totalSeconds:(performance.now()-started)/1000,sampledJavaRssPeakBytes:valid.length?Math.max(...valid.map(s=>s.javaRssBytes)):null,sampledJavaCpuPeakPercent:cpu.length?Math.max(...cpu):null,resourceSamples:samples.length,poolWaitMetric:'NOT INSTRUMENTED'};
writeFileSync(`target/stress-${count}.json`,JSON.stringify({summary,records,samples},null,2));console.log(JSON.stringify(summary));
