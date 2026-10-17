// No credentials in arguments, output, or source. Configure the environment privately.
import { randomUUID } from 'node:crypto';
const token=process.env.AUCTION_AGENT_TOKEN;
const id=Number(process.env.AUCTION_ID),ceiling=Number(process.env.AGENT_MAX_AMOUNT??500);
const base=process.env.API_BASE_URL??'http://127.0.0.1:5173/api/v1';
if(!token||!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(ceiling)||ceiling<110)throw new Error('Set AUCTION_AGENT_TOKEN, AUCTION_ID and optional AGENT_MAX_AMOUNT');
async function call(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`Agent HTTP ${r.status}`);return r.json();}
await call(`/auctions/${id}/join`,{});
for(let attempt=0;attempt<300;attempt++){
  const room=await call(`/auctions/${id}`);
  console.log(JSON.stringify({auctionId:id,status:room.status,price:room.current_price,seq:room.seq}));
  if(['FINISHED','CANCELLED'].includes(room.status))break;
  const next=room.current_price+room.min_increment;
  if(room.status==='RUNNING'&&next<=ceiling){const result=await call(`/auctions/${id}/bids`,{requestId:randomUUID(),amount:next});console.log(JSON.stringify({type:result.type,seq:result.seq,amount:result.amount,error:result.error}));}
  await new Promise(r=>setTimeout(r,3000));
}
