import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// This script creates isolated test identities and never logs bearer credentials.
if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated') throw new Error('Use an isolated test environment and set SIMULATION_ALLOW_MUTATION=isolated');
const options=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const bots=Number(options.bots??20),seed=Number(options.seed??42);
if(!Number.isInteger(bots)||bots<20||bots>50)throw new Error('bots must be 20..50');
const base=process.env.API_BASE_URL??'http://127.0.0.1:8080/api/v1';
const run=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;console.log(`PASS ${message}`);}
async function call(path,token,body,expected=200){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();let value;try{value=JSON.parse(raw);}catch{throw new Error(`${path}: HTTP ${r.status}, invalid JSON (${raw.slice(0,100)})`);}assert.equal(r.status,expected,`${path}: ${JSON.stringify(value)}`);return value;}
const login=async(email,pwd)=> (await call('/auth/login',null,{email,password:pwd})).token;
const admin=await login(process.env.SIMULATION_ADMIN_EMAIL??'admin@example.com',process.env.SIMULATION_ADMIN_PASSWORD??'Admin123456!');
const spec=await call('/openapi.json');
check(spec.openapi==='3.0.3'&&['/api/v1/auth/login','/api/v1/users/me','/api/v1/wallets/me','/api/v1/admin/auctions','/api/v1/admin/auctions/{id}/start','/api/v1/admin/auctions/{id}/cancel','/api/v1/admin/agent-tokens','/api/v1/auctions','/api/v1/auctions/{id}','/api/v1/auctions/{id}/join','/api/v1/auctions/{id}/bids'].every(p=>spec.paths[p]),'OpenAPI exposes all required API paths');
check(spec.paths['/api/v1/wallets/me'].get.responses['200'].content['application/json'].schema.$ref.endsWith('/Wallet'),'OpenAPI documents private wallet response');
check((await call('/users/me',admin)).role==='ADMIN','authenticated identity endpoint matches role');
const users=[];
for(let i=0;i<bots;i++){const email=`sim-${run}-${i}@example.test`;const u=await call('/admin/users',admin,{email,password,kind:'HUMAN'});users.push({...u,token:await login(email,password)});}
const agent=await call('/admin/users',admin,{email:`agent-${run}@example.test`,password,kind:'AGENT'});
const auction=options.auctionId?{id:Number(options.auctionId)}:await call('/admin/auctions',admin,{title:`simulation seed=${seed}`,durationSeconds:4});
const id=auction.id;
for(const u of users)await call(`/auctions/${id}/join`,u.token,{});
check((await call(`/auctions/${id}`,admin)).participants.length>=20,'20 users joined');
const issue=async(permissions,extra={})=>call('/admin/agent-tokens',admin,{userId:agent.id,auctionId:id,permissions,expiresInSeconds:3600,rateLimit:300,...extra});
const full=await issue(['auction:read','auction:bid']);
await call(`/auctions/${id}/join`,full.token,{});
const read=await issue(['auction:read']);
const bidOnly=await issue(['auction:bid']);
await call(`/auctions/${id}`,bidOnly.token,undefined,403);
await call(`/auctions/${id}/events?after=0`,bidOnly.token,undefined,403);
check(true,'bid-only Agent cannot read snapshots or events');
await call(`/auctions/${id}/bids`,read.token,{requestId:'forbidden',amount:110},403);
await call('/admin/auctions',full.token,{title:'forbidden'},403);
await call('/wallets/me',full.token,undefined,403);
await call('/auctions',full.token,undefined,403);
const other=await call('/admin/auctions',admin,{title:'unauthorized',durationSeconds:180});
await call(`/auctions/${other.id}`,full.token,undefined,403);
check(true,'Agent cannot access admin, wallets, list or unauthorized auction; missing bid permission denied');
const limited=await issue(['auction:read'],{rateLimit:1});
await call(`/auctions/${id}`,limited.token);await call(`/auctions/${id}`,limited.token,undefined,429);
await call(`/admin/agent-tokens/${read.id}/revoke`,admin,{});await call(`/auctions/${id}`,read.token,undefined,401);
const expires=await issue(['auction:read'],{expiresInSeconds:1});await new Promise(r=>setTimeout(r,1100));await call(`/auctions/${id}`,expires.token,undefined,401);
check(true,'Agent rate limit, revocation and expiry enforced');
await call(`/admin/auctions/${id}/start`,admin,{});
let price=100,sequence=0;
let rng=seed>>>0;const order=[...users];for(let i=order.length-1;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=rng%(i+1);[order[i],order[j]]=[order[j],order[i]];}
for(const [index,u] of order.entries()){price+=10;const b=await call(`/auctions/${id}/bids`,u.token,{requestId:`normal-${index}`,amount:price});check(b.type==='BID_ACCEPTED',`incremental bid ${index+1}`);}
const duplicate={requestId:'concurrent-retry',amount:price+10};
const retries=await Promise.all(Array.from({length:4},()=>call(`/auctions/${id}/bids`,users[0].token,duplicate)));
check(retries.every(r=>r.type==='BID_ACCEPTED')&&retries.filter(r=>!r.replayed).length===1,'concurrent request retries have one effect');price+=10;
await call(`/auctions/${id}/bids`,users[0].token,{...duplicate,amount:price+10},409);
const race=await Promise.all([users[1],users[2]].map((u,i)=>call(`/auctions/${id}/bids`,u.token,{requestId:`race-${i}`,amount:price+10})));
check(race.filter(r=>r.type==='BID_ACCEPTED').length===1,'same-price race has exactly one leader');price+=10;
const adjacent=await Promise.all([users[5],users[6]].map((u,i)=>call(`/auctions/${id}/bids`,u.token,{requestId:`adjacent-${i}`,amount:price+10+i*10})));
price+=20;
check(adjacent[1].type==='BID_ACCEPTED'&&(await call(`/auctions/${id}`,admin)).current_price===price,'adjacent-price race converges to higher bid');
check((await call(`/auctions/${id}/bids`,users[3].token,{requestId:'low',amount:100})).error==='BID_TOO_LOW','low bid rejected');
check((await call(`/auctions/${id}/bids`,users[3].token,{requestId:'funds',amount:1001})).error==='INSUFFICIENT_FUNDS','insufficient funds rejected');
const ownEvents=await call(`/auctions/${id}/events?after=0`,users[3].token);
const otherEvents=await call(`/auctions/${id}/events?after=0`,users[4].token);
check(ownEvents.events.some(e=>e.type==='BID_REJECTED')&&!otherEvents.events.some(e=>e.type==='BID_REJECTED'),'rejected events are private to bidder');
check(ownEvents.auctionId===id&&ownEvents.type==='CONNECTION_STATE'&&Number.isInteger(ownEvents.seq)&&ownEvents.serverTime,'connection state has required envelope');
let state=await call(`/auctions/${id}`,admin);sequence=state.seq;
check(state.extension_count===1,'first last-five-seconds bid extends once');
for(let extension=1;extension<=3;extension++) {
  const wait=Math.max(0,Date.parse(state.end_at)-Date.now()-3500);
  await new Promise(r=>setTimeout(r,wait));price+=10;
  const out=await call(`/auctions/${id}/bids`,full.token,{requestId:`snipe-${extension}`,amount:price});
  check(out.type==='BID_ACCEPTED'&&out.extended===(extension<3),`snipe ${extension}: cap preserved`);
  state=await call(`/auctions/${id}`,admin);
}
const events=await call(`/auctions/${id}/events?after=${sequence}`,users[0].token);
check(events.events.every((e,i)=>e.auctionId===id&&e.type&&e.serverTime&&e.seq===sequence+i+1),'persisted events have ordered seq and required envelope');
const restored=await call(`/auctions/${id}`,users[0].token);check(restored.seq>=sequence&&restored.current_price===price,'reconnect snapshot restores authority');
await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(state.end_at)-Date.now()+2000)));
state=await call(`/auctions/${id}`,admin);
check(state.status==='FINISHED'&&state.result.length===1&&state.result[0].winner_id===agent.id&&state.result[0].price===price,'automatic unique settlement and Agent winner');
check((await call(`/auctions/${id}/bids`,users[0].token,{requestId:'late',amount:price+10})).type==='BID_REJECTED','finished auction rejects bids');
for(const u of users){const w=await call('/wallets/me',u.token);check(w.frozen_balance===0&&w.total_balance===1000,`loser ${u.id} funds released`);}
// Exercise the separately documented environment-token Agent against isolated data.
const externalToken=await call('/admin/agent-tokens',admin,{userId:agent.id,auctionId:other.id,permissions:['auction:read','auction:bid'],expiresInSeconds:60,rateLimit:120});
await call(`/admin/auctions/${other.id}/start`,admin,{});
const {spawn}=await import('node:child_process');
const child=spawn(process.execPath,[fileURLToPath(new URL('./auction-agent.mjs',import.meta.url))],{env:{...process.env,AUCTION_AGENT_TOKEN:externalToken.token,AUCTION_ID:String(other.id),AGENT_MAX_AMOUNT:'110',API_BASE_URL:base},stdio:['ignore','ignore','ignore']});
const exited=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('exit',code=>resolve(code));});
try {
  let accepted=false;
  for(let i=0;i<40;i++){const snapshot=await call(`/auctions/${other.id}`,admin);if(snapshot.current_price===110&&snapshot.leader_id===agent.id){accepted=true;break;}await new Promise(r=>setTimeout(r,250));}
  check(accepted,'standalone environment-token Agent placed a real bid');
  await call(`/admin/auctions/${other.id}/cancel`,admin,{});
  const code=await Promise.race([exited,new Promise(resolve=>setTimeout(()=>resolve(-1),5000))]);
  check(code===0,'standalone Agent reads terminal state and exits');
} finally {if(child.exitCode===null)child.kill();}
const credentials=[admin,...users.map(u=>u.token),full.token,read.token,bidOnly.token,limited.token,expires.token,externalToken.token];
if(process.env.VERIFY_LOCAL_ARTIFACTS==='true'){
  const backendLog=fileURLToPath(new URL('../backend/target/http-simulation-backend.log',import.meta.url));
  const assets=fileURLToPath(new URL('../frontend/dist/assets/',import.meta.url));
  check(existsSync(backendLog)&&existsSync(assets)&&[backendLog,...readdirSync(assets).filter(p=>p.endsWith('.js')).map(p=>assets+p)].every(p=>credentials.every(t=>!readFileSync(p,'utf8').includes(t))),'issued test credentials absent from backend log and frontend bundle');
}
console.log(JSON.stringify({type:'SIMULATION_SUMMARY',auctionId:id,bots,seed,assertions:checks,winnerId:agent.id,price,status:'PASS'}));
