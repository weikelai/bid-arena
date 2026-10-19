import {describe,it,expect} from 'vitest';
import {agentLabel,budgetPercent,strategies} from './agent';
describe('Agent monitoring presentation',()=>{
 it('distinguishes waiting, actual running, stopping and final states',()=>{
  expect(agentLabel('STARTING')).toContain('确认');expect(agentLabel('STOPPING')).toContain('最后请求');
  expect(agentLabel('DRAFT')).toContain('管理员');expect(agentLabel('BID_ACCEPTED')).toBe('出价已接受');
  expect(agentLabel('HTTP_401')).toContain('授权');expect(agentLabel('NEW_SERVER_STATE')).toBe('NEW_SERVER_STATE');
 });
 it('shows money occupied without adding repeated bid amounts',()=>{
  expect(budgetPercent(150,0,300)).toBe(50);expect(budgetPercent(0,150,300)).toBe(50);
  expect(budgetPercent(0,0,0)).toBe(0);expect(budgetPercent(1000,0,300)).toBe(100);
 });
 it('offers explicit conservative, balanced and read-only choices',()=>{
  expect(strategies.map(s=>s.id)).toEqual(['CONSERVATIVE','BALANCED','MONITOR']);
 });
});
