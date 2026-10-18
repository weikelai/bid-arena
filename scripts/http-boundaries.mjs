import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated')throw Error('Isolated test database required');
const base=process.env.API_BASE_URL,password=randomBytes(24).toString('hex');let checks=0;
async function call(path,token,body,expected=200,raw=false){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await r.json();assert.equal(r.status,expected,`${path}: ${data.error}`);checks++;return data;}
const admin=(await call('/auth/login',null,{email:'admin@example.com',password:'Admin123456!'})).token;
await call('/auth/login',null,{email:"' OR 1=1 --",password:'invalid'},401);
for(const body of ['{','[]','null'])await call('/auth/login',null,body,400,true);
await call('/admin/auctions',admin,{title:'overflow',durationSeconds:2147483648},400);
for(const durationSeconds of [0,-1,86401,1.5,'180'])await call('/admin/auctions',admin,{title:'invalid',durationSeconds},400);
const auction=await call('/admin/auctions',admin,{title:'HTTP boundary <script> inert text',durationSeconds:180});
const agent=await call('/admin/users',admin,{email:`boundary-${randomBytes(6).toString('hex')}@example.test`,password,kind:'AGENT'});
const issued=[];
try{
 const full=await call('/admin/agent-tokens',admin,{userId:agent.id,auctionId:auction.id,permissions:['auction:read','auction:bid'],rateLimit:300});issued.push(full.id);
 await call(`/auctions/${auction.id}/join`,full.token,{});await call(`/admin/auctions/${auction.id}/start`,admin,{});
 for(const amount of [-1,0,9000000000001,1.5,'110',null])await call(`/auctions/${auction.id}/bids`,full.token,{requestId:randomBytes(6).toString('hex'),amount},400);
 for(const requestId of ['', 'x'.repeat(65),'<script>'])await call(`/auctions/${auction.id}/bids`,full.token,{requestId,amount:110},400);
 const body={requestId:'concurrent-agent-'+randomBytes(6).toString('hex'),amount:110};
 const responses=await Promise.all(Array.from({length:12},()=>call(`/auctions/${auction.id}/bids`,full.token,body)));
 assert.ok(responses.every(r=>r.type==='BID_ACCEPTED'&&r.seq===responses[0].seq));checks++;
 assert.equal((await call(`/auctions/${auction.id}/bids`,full.token)).length,1);checks++;
 await call(`/auctions/${auction.id}/bids`,full.token,{...body,amount:120},409);
 const limited=await call('/admin/agent-tokens',admin,{userId:agent.id,auctionId:auction.id,permissions:['auction:read'],rateLimit:3});issued.push(limited.id);
 // A request crossing a wall-clock minute could legitimately replenish the bucket.
 while(Date.now()%60000>55000)await new Promise(r=>setTimeout(r,250));
 const codes=await Promise.all(Array.from({length:10},async()=>{const r=await fetch(base+`/auctions/${auction.id}`,{headers:{Authorization:'Bearer '+limited.token}});await r.arrayBuffer();return r.status;}));
 assert.equal(codes.filter(c=>c===200).length,3);assert.equal(codes.filter(c=>c===429).length,7);checks+=2;
 await call('/wallets/me',full.token,undefined,403);await call('/admin/auctions',full.token,{title:'denied'},403);
}finally{for(const id of issued)await call(`/admin/agent-tokens/${id}/revoke`,admin,{});await call(`/admin/auctions/${auction.id}/cancel`,admin,{});}
console.log(JSON.stringify({status:'PASS',checks,scenario:'HTTP malformed parameters, SQL injection login, concurrent scoped token idempotency and rate limit',tokensRevoked:issued.length}));
