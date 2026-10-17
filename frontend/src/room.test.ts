import { describe,it,expect } from 'vitest';
import {requiresSnapshot,secondsLeft,type RoomEvent} from './room';
describe('authoritative room recovery',()=>{
  const event=(seq:number)=>({seq,auctionId:1,serverTime:'2026-01-01T00:00:00Z',type:'BID_ACCEPTED',payload:'{}'} as RoomEvent);
  it('resynchronizes contiguous updates and gaps without guessing price',()=>{expect(requiresSnapshot(3,[event(4)])).toBe(true);expect(requiresSnapshot(3,[event(6)])).toBe(true);expect(requiresSnapshot(3,[])).toBe(false);});
  it('uses server offset and clamps expired countdown',()=>{expect(secondsLeft('2026-01-01T00:00:05Z',1000,Date.parse('2026-01-01T00:00:00Z'))).toBe(4);expect(secondsLeft(null,0)).toBe(0);expect(secondsLeft('2020-01-01T00:00:00Z',0)).toBe(0);});
});
