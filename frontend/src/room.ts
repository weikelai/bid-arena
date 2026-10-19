export interface Room { id: number; title: string; status: string; current_price: number; start_price?: number; min_increment: number; leader_id: number | null; end_at: string | null; extension_count: number; seq: number; server_time: string; result: { winner_id: number | null; price: number; reason: string }[]; participants: { user_id: number; email: string; kind: string }[] }
export interface RoomEvent { auctionId: number; seq: number; serverTime: string; type: string; payload: string }
export function acceptRoom(current:Room|null,incoming:Room,selected:number):boolean {
  return incoming.id===selected&&(!current||current.id!==incoming.id||incoming.seq>=current.seq);
}
export function outcome(room:Room|null,user:number|null,hasBid:boolean):string {
  if(!room)return '';
  if(room.status==='CANCELLED')return '拍卖已取消，冻结已释放';
  if(room.status==='FINISHED'){
    const result=room.result[0];if(!result)return '成交结果同步中';
    if(result.winner_id===null)return '拍卖已结束，无人获胜';
    return result.winner_id===user?'拍卖已结束，你获得成交':'拍卖已结束，其他用户获得成交';
  }
  if(room.status==='SETTLING')return '正在结算，等待服务端确认';
  if(room.status==='RUNNING'&&room.leader_id===user)return '你目前领先';
  if(room.status==='RUNNING'&&hasBid)return '你已被其他用户超过';
  return room.status==='RUNNING'?'拍卖进行中，尚未领先':'拍卖尚未开始';
}
export function requiresSnapshot(seq: number, events: RoomEvent[]): boolean {
  let current=seq;
  for(const event of events) { if(event.seq<=current)continue; if(event.seq!==current+1)return true; current=event.seq; }
  return events.length>0;
}
export function secondsLeft(end: string|null, serverOffset: number, now=Date.now()): number {
  return end ? Math.max(0,Math.ceil((Date.parse(end)-now-serverOffset)/1000)) : 0;
}
