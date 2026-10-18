import { describe,it,expect } from 'vitest';
import {acceptRoom,outcome,requiresSnapshot,secondsLeft,type Room,type RoomEvent} from './room';
describe('authoritative room recovery',()=>{
  const room=(seq:number,status='RUNNING',leader=2)=>({id:1,seq,status,leader_id:leader,result:[]} as unknown as Room);
  it('rejects late lower sequence snapshots and responses for another selected auction',()=>{expect(acceptRoom(room(12),room(8),1)).toBe(false);expect(acceptRoom(room(12,'FINISHED'),room(9),1)).toBe(false);expect(acceptRoom(room(12),room(13),2)).toBe(false);expect(acceptRoom(room(12),room(13),1)).toBe(true);});
  it('accepted bids do not establish winners and outbid users never see WON',()=>{expect(outcome(room(4),2,true)).toBe('你目前领先');expect(outcome(room(5,'RUNNING',3),2,true)).toBe('你已被其他用户超过');const finished={...room(6,'FINISHED',3),result:[{winner_id:3,price:130,reason:'SOLD'}]};expect(outcome(finished,2,true)).toBe('拍卖已结束，其他用户获得成交');expect(outcome(finished,3,true)).toBe('拍卖已结束，你获得成交');expect(outcome({...finished,result:[{winner_id:null,price:0,reason:'NO_BIDS'}]},2,false)).toBe('拍卖已结束，无人获胜');});
  const event=(seq:number)=>({seq,auctionId:1,serverTime:'2026-01-01T00:00:00Z',type:'BID_ACCEPTED',payload:'{}'} as RoomEvent);
  it('resynchronizes contiguous updates and gaps without guessing price',()=>{expect(requiresSnapshot(3,[event(4)])).toBe(true);expect(requiresSnapshot(3,[event(6)])).toBe(true);expect(requiresSnapshot(3,[])).toBe(false);});
  it('uses server offset and clamps expired countdown',()=>{expect(secondsLeft('2026-01-01T00:00:05Z',1000,Date.parse('2026-01-01T00:00:00Z'))).toBe(4);expect(secondsLeft(null,0)).toBe(0);expect(secondsLeft('2020-01-01T00:00:00Z',0)).toBe(0);});
});
