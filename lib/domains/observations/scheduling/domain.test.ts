import {describe,it,expect} from 'vitest';
import {normalizeSchedule,retryDelayMinutes,schedulingEnabled} from './domain';
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
describe('budgeted approved source schedule',()=>{
 it('rejects short intervals, fractional budgets, and arbitrary providers',()=>{expect(()=>normalizeSchedule({configId:id,enabled:true,intervalMinutes:59,dailyBudget:2})).toThrow();expect(()=>normalizeSchedule({configId:id,enabled:true,intervalMinutes:60,dailyBudget:2.5})).toThrow();expect(()=>normalizeSchedule({configId:id,enabled:true,intervalMinutes:60,dailyBudget:2,url:'https://other.example'})).toThrow();});
 it('keeps user chosen integer budget and defaults explicit max attempts',()=>{expect(normalizeSchedule({configId:id,enabled:false,intervalMinutes:60,dailyBudget:1})).toMatchObject({enabled:false,dailyBudget:1,maxAttempts:3});});
 it('uses bounded exponential backoff and dependent default-off flags',()=>{expect([1,2,3,4].map(retryDelayMinutes)).toEqual([1,2,4,8]);expect(schedulingEnabled({SCHEDULED_OBSERVATIONS_ENABLED:'true'})).toBe(false);expect(schedulingEnabled({SCHEDULED_OBSERVATIONS_ENABLED:'true',STATISTICAL_DENOMINATORS_ENABLED:'true'})).toBe(true);});
});
