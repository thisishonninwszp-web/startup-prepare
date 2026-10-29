import {describe,it,expect} from 'vitest';
import {normalizeAttention,parseAttentionCursor} from './domain';
import {isFixedSample} from './sampling';
describe('voluntary reading contract',()=>{
 it('rejects implicit exposure and client chosen sample ordinals',()=>{
  expect(()=>normalizeAttention('register',{snapshotId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',choice:'loaded'})).toThrow();
  expect(()=>normalizeAttention('register',{snapshotId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',choice:'skip',ordinal:1})).toThrow();
 });
 it('requires triggers, counterevidence and a preregistered integer interval',()=>{
  expect(()=>normalizeAttention('contract',{triggers:'change',counterevidence:'',everyNth:3})).toThrow();
  expect(normalizeAttention('contract',{triggers:'change',counterevidence:'contradiction',everyNth:3})).toEqual({triggers:'change',counterevidence:'contradiction',everyNth:3});
 });
 it('samples the first and every Nth following registration including skipped choices',()=>{
  expect([1,2,3,4,5,6,7].filter(n=>isFixedSample(n,3))).toEqual([1,4,7]);
 });
 it('preserves precise keyset cursor and rejects invalid cursors',()=>{
  expect(parseAttentionCursor('9007199254740993')).toBe('9007199254740993');expect(()=>parseAttentionCursor('1.2')).toThrow();
 });
 it('records an explicitly observed seen action without inferring page exposure',()=>{expect(normalizeAttention('register',{snapshotId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',choice:'seen'})).toHaveProperty('choice','seen');});
 it('defaults manual matching to unknown without hiding materials',()=>{expect(normalizeAttention('register',{snapshotId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',choice:'skip'})).toHaveProperty('contractMatch','unknown');});
 it('requires judgment before asking for reveal; exit needs no judgment',()=>{
  expect(()=>normalizeAttention('blind_judge',{sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',judgment:''})).toThrow();
  expect(normalizeAttention('blind_exit',{sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'})).toHaveProperty('sessionId');
 });
});


