import http from 'node:http';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const base=process.env.AGENT_API_URL,secret=process.env.AGENT_CONTROL_SECRET,key=process.env.AGENT_VAULT_KEY;
if(!base||!secret||secret.length<32||!/^[a-f0-9]{64}$/.test(key??''))throw Error('Missing Agent runtime configuration');
if(!base.startsWith('https://')&&process.env.AGENT_ALLOW_PRIVATE_HTTP!=='true')throw Error('HTTPS required');
const dir=process.env.AGENT_VAULT_DIR??'/data',owner=randomUUID();
await mkdir(dir,{recursive:true,mode:0o700});await chmod(dir,0o700);
const auth='Bearer '+secret,uuid=/^[a-f0-9-]{36}$/;
let stopping=false,lastCycle=Date.now();
function authorized(value){const a=Buffer.from(value??''),b=Buffer.from(auth);return a.length===b.length&&timingSafeEqual(a,b);}
async function store(id,token){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);const tmp=join(dir,id+'.'+randomUUID()+'.tmp');await writeFile(tmp,Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600,flag:'wx'});await rename(tmp,join(dir,id));}
async function load(id){if(!uuid.test(id))throw Error('VAULT_ID');const buf=await readFile(join(dir,id));const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),buf.subarray(0,12));decipher.setAuthTag(buf.subarray(12,28));return Buffer.concat([decipher.update(buf.subarray(28)),decipher.final()]).toString('utf8');}
const server=http.createServer(async(req,res)=>{try{
 if(req.method==='GET'&&req.url==='/health'){res.writeHead(Date.now()-lastCycle<120000?200:503);res.end('agent-worker');return;}
 if(req.method!=='POST'||req.url!=='/vault'||!authorized(req.headers.authorization)){res.writeHead(403);res.end();return;}
 let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){res.writeHead(413);res.end();req.destroy();return;}body+=chunk;}
 const b=JSON.parse(body);if(!uuid.test(b.id)||!/^[A-Za-z0-9_-]{43}$/.test(b.token)){res.writeHead(400);res.end();return;}
 await store(b.id,b.token);res.writeHead(204);res.end();
 }catch{res.writeHead(400);res.end();}});
server.requestTimeout=10000;server.headersTimeout=10000;
server.listen(Number(process.env.AGENT_PORT??8090),process.env.AGENT_BIND??'0.0.0.0');
class ResponseError extends Error{constructor(status){super('HTTP_'+status);this.status=status;}}
async function call(path,credential,body,timeout=5000){const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});if(!res.ok)throw new ResponseError(res.status);return res.json();}
async function control(path,body){return call('/internal/agent-jobs/'+path,secret,body);}
export function decide(job,room){
 if(['FINISHED','CANCELLED'].includes(room.status))return {state:'FINISHED',detail:room.status,result:room.result};
 if(room.status!=='RUNNING')return {state:'WAITING',detail:room.status};
 if(room.leader_id===job.user_id)return {state:'RUNNING',detail:'ALREADY_LEADING'};
 if(job.bid_count>=job.max_bids)return {state:'WAITING',detail:'MAX_BIDS_MONITOR_ONLY'};
 const amount=room.current_price+room.min_increment;
 if(amount>job.max_bid)return {state:'WAITING',detail:'BUDGET_MONITOR_ONLY'};
 return {amount};
}
async function step(job){
 const identity={owner,epoch:job.lease_epoch},post=(suffix,b={})=>control(job.id+'/'+suffix,{...identity,...b});
 let pending=job.pending_id?{requestId:job.pending_id,amount:job.pending_amount}:null;
 let report={state:'RUNNING',detail:'MONITORING',delayMs:job.poll_ms};
 try{
  // Recovery also fences a submission which was prepared but not sent before stop.
  if(pending){const receipt=await post('recover');if(receipt.resolved){await post('report',{...report,detail:receipt.detail,resolved:true,requestId:pending.requestId});return;}}
  const token=await load(job.id),path='/auctions/'+job.auction_id;
  if(pending){const out=await call(path+'/bids',token,pending,job.timeout_ms);report={...report,detail:out.type,resolved:true,requestId:pending.requestId};}
  else {
   const room=await call(path,token,undefined,job.timeout_ms);report={...report,price:room.current_price,leader:room.leader_id,...decide(job,room)};
   if(report.amount){
    if(!room.participants.some(p=>p.user_id===job.user_id))await call(path+'/join',token,{},job.timeout_ms);
    pending=await post('prepare',{amount:report.amount});
    const out=await call(path+'/bids',token,pending,job.timeout_ms);
    report={...report,detail:out.type,resolved:true,requestId:pending.requestId};
    if(out.type==='BID_REJECTED'&&out.error==='INSUFFICIENT_FUNDS')report={...report,state:'ERROR',detail:'INSUFFICIENT_FUNDS'};
   }
  }
 }catch(error){
  const code=error instanceof ResponseError?'HTTP_'+error.status:error?.code==='ENOENT'?'VAULT_MISSING':'NETWORK_OR_RUNTIME';
  const terminal=error instanceof ResponseError&&[401,403,400].includes(error.status);
  report={state:terminal&&!pending?'ERROR':'WAITING',detail:pending?'PENDING_RECOVERY':code,error:code,delayMs:error.status===429?65000:Math.min(120000,3000*2**Math.min(job.error_count,5))};
 }
 await post('report',report);
}
console.log('Agent Worker started; credentials omitted');
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;});
while(!stopping){try{lastCycle=Date.now();const job=await control('claim',{owner});if(job.id)await step(job);else await sleep(500);}catch(error){console.log('Coordination retry '+(error instanceof ResponseError?'HTTP_'+error.status:'UNAVAILABLE'));await sleep(1000);}}
server.close();
