export interface Room { id: number; title: string; status: string; current_price: number; min_increment: number; leader_id: number | null; end_at: string | null; extension_count: number; seq: number; server_time: string; result: { winner_id: number | null; price: number; reason: string }[]; participants: { user_id: number; email: string; kind: string }[] }
export interface RoomEvent { auctionId: number; seq: number; serverTime: string; type: string; payload: string }
export function requiresSnapshot(seq: number, events: RoomEvent[]): boolean {
  let current=seq;
  for(const event of events) { if(event.seq<=current)continue; if(event.seq!==current+1)return true; current=event.seq; }
  return events.length>0;
}
export function secondsLeft(end: string|null, serverOffset: number, now=Date.now()): number {
  return end ? Math.max(0,Math.ceil((Date.parse(end)-now-serverOffset)/1000)) : 0;
}
