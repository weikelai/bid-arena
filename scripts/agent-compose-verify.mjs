import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
if(process.env.AGENT_COMPOSE_DEMO!=='allow')throw Error('Set AGENT_COMPOSE_DEMO=allow to create dedicated local demo data');
const base=process.env.API_BASE_URL??'http://127.0.0.1:8080/api/v1';
let admin;
async function api(path,body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('HTTP_'+r.status+' '+path);return r.json();}
async function until(fn,label,ms=25000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(250);}throw Error('Timed out '+label);}
function compose(...args){const r=spawnSync('docker',['compose','--profile','agents',...args],{encoding:'utf8'});if(r.status!==0)throw Error('Compose '+args[0]+' failed');console.log('PASS docker compose --profile agents '+args.join(' ')+' exit=0');}
admin=(await api('/auth/login',{email:'admin@example.com',password:process.env.DEMO_ADMIN_PASSWORD??'Admin123456!'})).token;
const auction=(await api('/admin/auctions',{title:'Independent Agent service demonstration '+new Date().toISOString(),durationSeconds:180})).id;
const user=(await api('/admin/users',{email:'service-demo-'+randomBytes(6).toString('hex')+'@example.com',password:randomBytes(24).toString('hex'),kind:'AGENT'})).id;
const issued=await api('/admin/agent-tokens',{userId:user,auctionId:auction,permissions:['auction:read','auction:bid'],expiresInSeconds:3600,rateLimit:120});
const job=await api('/admin/agent-jobs',{name:'独立服务验收演示',userId:user,auctionId:auction,token:issued.token,maxBidAmount:200,maxBids:5});
const status=async()=>(await api('/admin/agent-jobs')).find(j=>j.id===job.id);
try{
 await api('/admin/agent-jobs/'+job.id+'/start',{});await until(async()=> (await status()).last_result==='DRAFT','DRAFT');assert.equal((await api('/auctions/'+auction)).status,'DRAFT');
 compose('stop','agent-worker');assert.equal((await api('/health')).status,'UP');compose('start','agent-worker');
 await api('/admin/auctions/'+auction+'/start',{});await until(async()=> (await api('/auctions/'+auction)).leader_id===user,'automatic bid');
 compose('restart','agent-worker');await sleep(4500);assert.equal((await api('/auctions/'+auction+'/bids')).length,1);
 await api('/admin/auctions/'+auction+'/cancel',{});await until(async()=> (await status()).state==='FINISHED','cancelled task');
 await api('/admin/agent-jobs/'+job.id+'/revoke',{});
 console.log(JSON.stringify({status:'PASS',auctionId:auction,agentUserId:user,jobId:job.id,acceptedBids:1,tokenRevoked:true,auctionState:'CANCELLED',workerLifecycle:'stop/start/restart',at:new Date().toISOString()}));
}finally{
 // Only the demonstration this script created. Never touch existing auctions.
 const room=await api('/auctions/'+auction);if(['DRAFT','RUNNING'].includes(room.status))await api('/admin/auctions/'+auction+'/cancel',{});
 await api('/admin/agent-jobs/'+job.id+'/revoke',{});compose('start','agent-worker');
}
