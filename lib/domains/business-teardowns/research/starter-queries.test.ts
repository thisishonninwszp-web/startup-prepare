import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {StarterCase} from './starter-types';
const {from,build}=vi.hoisted(()=>({from:vi.fn(),build:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{from}}));
vi.mock('./starter',()=>({buildResearchStarter:build}));
import {loadResearchStarter} from './starter-queries';

const owner='10000000-0000-4000-8000-000000000001';
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function query(data:unknown,error:unknown=null){
 const q={select:vi.fn(),eq:vi.fn(),neq:vi.fn(),in:vi.fn(),is:vi.fn(),not:vi.fn(),order:vi.fn(),limit:vi.fn(),maybeSingle:vi.fn(),then:undefined as unknown};
 for(const method of Object.keys(q))if(method!=='then')(q as Record<string,unknown>)[method]=vi.fn(()=>q);
 q.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error}).then(resolve);return q;
}
const selected=(n=1)=>({id:id(n),merchant_id:id(n+10),local_date:'2026-11-11',published_revision_id:id(n+20)});
const merchant=(n=1)=>({id:id(n+10),name:`店铺 ${n}`,platform:'shopify'});
const section={key:'buyers',observations:[],interpretations:[{text:'购买者解释',refs:[{snapshotId:id(31),quote:'公开的逐字原文'}],competingExplanation:'其他解释',distinguishingObservation:'需要核对'}],unknowns:[],validationDiagnostics:[{rejectedText:'绝不进入下稿的私密诊断'}],validationGaps:[{reason:'citation_rejected'}]};
function fixture(options:{cases?:ReturnType<typeof selected>[];members?:unknown[];snapshots?:unknown[];report?:unknown;recent?:unknown[];merchants?:unknown[]}={}){
 const tables:Record<string,ReturnType<typeof query>[]>= {
  business_daily_cases:[query(options.cases??[selected()]),query(options.recent??[{id:id(3),merchant_id:id(13),local_date:'2026-11-10'}])],
  business_merchants:[query(options.merchants??[merchant(),merchant(3)])],
  business_case_members:[query(options.members??[{snapshot_id:id(31)}])],
  business_material_snapshots:[query(options.snapshots??[{id:id(31),captured_text:'这是公开的逐字原文。',source_url:'https://example.com/source',captured_at:'2026-11-11T00:00:00Z',published_at:'2026-11-10T00:00:00Z',coverage:'公开说明'}])],
  business_case_revisions:[query(options.report===undefined?{id:id(21),revision:2,sections:[section]}:options.report)],
 };
 from.mockImplementation((table:string)=>{const q=tables[table]?.shift();if(!q)throw new Error(`Unexpected table read: ${table}`);return q;});
 return tables;
}
function readQueries(){return from.mock.results.map(result=>result.value as ReturnType<typeof query>);}
describe('loadResearchStarter',()=>{
 beforeEach(()=>{from.mockReset();build.mockReset();build.mockReturnValue({kind:'comparison',cases:[],sources:[],candidates:[],hints:[],draft:{title:'',payload:{},bindings:{}},gaps:[],truncated:false});});
 it('rejects invalid owner, kinds, malformed, empty, duplicate and excessive selected IDs before any query',async()=>{
  for(const [user,input] of [ ['bad',{caseIds:[id(1)],kind:'comparison'}], [owner,{caseIds:[id(1)],kind:'invented'}], [owner,{caseIds:['bad'],kind:'failure'}], [owner,{caseIds:[],kind:'failure'}], [owner,{caseIds:[id(1),id(1).toUpperCase()],kind:'failure'}], [owner,{caseIds:[id(1),id(2),id(3)],kind:'failure'}], [owner,{caseIds:[id(1)],kind:'failure',user_id:owner}] ] as const){
   await expect(loadResearchStarter(user,input as never)).rejects.toThrow();
  }
  expect(from).not.toHaveBeenCalled();
 });
 it('passes current owned evidence and sanitized published report to the pure builder',async()=>{
  fixture();const result=await loadResearchStarter(owner,{caseIds:[id(1)],kind:'comparison'});
  expect(result).toBe(build.mock.results[0].value);
  const [kind,cases,recent]=build.mock.calls[0] as [string,StarterCase[],StarterCase[]];
  expect(kind).toBe('comparison');expect(cases[0]).toMatchObject({id:id(1),name:'店铺 1',date:'2026-11-11',merchantId:id(11),platform:'shopify',sourcesTruncated:false,report:{id:id(21),revision:2}});
  expect(cases[0].sources[0]).toEqual({id:id(31),kind:'snapshot',title:'公开说明',text:'这是公开的逐字原文。',url:'https://example.com/source',date:'2026-11-10T00:00:00Z'});
  expect(cases[0].report?.sections[0]).not.toHaveProperty('validationDiagnostics');expect(cases[0].report?.sections[0]).not.toHaveProperty('validationGaps');
  expect(JSON.stringify(build.mock.calls)).not.toContain('绝不进入下稿');
  expect(recent).toEqual([{id:id(3),name:'店铺 3',date:'2026-11-10',merchantId:id(13),platform:'shopify',sources:[],sourcesTruncated:false,report:null}]);
  for(const q of readQueries())expect(q.eq).toHaveBeenCalledWith('user_id',owner);
  const queries=readQueries();
  expect(queries.find(q=>q.select.mock.calls[0][0]==='id,revision,sections')?.eq).toHaveBeenCalledWith('id',id(21));
  expect(from.mock.calls.map(call=>call[0])).not.toEqual(expect.arrayContaining(['ideas','business_report_diagnostics','career_entries']));
 });
 it('preserves selected input order even when the database returns the opposite order',async()=>{
  const tables=fixture({cases:[selected(2),selected(1)],merchants:[merchant(1),merchant(2),merchant(3)],members:[],report:null});
  tables.business_case_members.push(query([]));tables.business_case_revisions.push(query(null));
  await loadResearchStarter(owner,{caseIds:[id(1),id(2)],kind:'comparison'});
  expect(build.mock.calls[0][1].map((entry:StarterCase)=>entry.id)).toEqual([id(1),id(2)]);
 });
 it('throws a useful missing/foreign selected-case error instead of silently dropping it',async()=>{
  fixture({cases:[]});await expect(loadResearchStarter(owner,{caseIds:[id(1)],kind:'failure'})).rejects.toThrow(/案例/);expect(build).not.toHaveBeenCalled();
 });
 it('treats erased report and missing snapshots as absent evidence and scopes the current revision',async()=>{
  fixture({snapshots:[],report:null});await loadResearchStarter(owner,{caseIds:[id(1)],kind:'apprenticeship'});
  const cases=build.mock.calls[0][1] as StarterCase[];expect(cases[0].report).toBeNull();expect(cases[0].sources).toEqual([]);
  const revisions=readQueries().find(q=>q.select.mock.calls[0][0]==='id,revision,sections')!;
  expect(revisions.eq).toHaveBeenCalledWith('case_id',id(1));expect(revisions.is).toHaveBeenCalledWith('erased_at',null);
  const snapshots=readQueries().find(q=>q.select.mock.calls[0][0].includes('captured_text'))!;
  expect(snapshots.is).toHaveBeenCalledWith('erased_at',null);expect(snapshots.not).toHaveBeenCalledWith('captured_text','is',null);expect(snapshots.neq).toHaveBeenCalledWith('captured_text','');
 });
 it('loads only 20 snapshots plus a member sentinel, and recent cases as bounded metadata only',async()=>{
  fixture({members:Array.from({length:21},(_,n)=>({snapshot_id:id(n+31)})),snapshots:[]});
  await loadResearchStarter(owner,{caseIds:[id(1)],kind:'comparison'});
  expect(build.mock.calls[0][1][0].sourcesTruncated).toBe(true);
  const members=readQueries().find(q=>q.select.mock.calls[0][0]==='snapshot_id')!;expect(members.limit).toHaveBeenCalledWith(21);expect(members.eq).toHaveBeenCalledWith('case_id',id(1));
  const snapshots=readQueries().find(q=>q.select.mock.calls[0][0].includes('captured_text'))!;expect(snapshots.in).toHaveBeenCalledWith('id',Array.from({length:20},(_,n)=>id(n+31)));
  const daily=readQueries().filter(q=>q.select.mock.calls[0][0].startsWith('id,merchant_id,local_date'));
  expect(daily[1].limit).toHaveBeenCalledWith(20);expect(daily[1].neq).toHaveBeenCalledWith('id',id(1));expect(daily[1].order).toHaveBeenCalledWith('local_date',{ascending:false});
  expect(from.mock.calls.filter(call=>call[0]==='business_case_members')).toHaveLength(1);
  expect(from.mock.calls.filter(call=>call[0]==='business_case_revisions')).toHaveLength(1);
 });
 it('propagates database failure instead of returning partial drafts',async()=>{
  from.mockReturnValue(query(null,{message:'database unavailable'}));await expect(loadResearchStarter(owner,{caseIds:[id(1)],kind:'failure'})).rejects.toThrow('database unavailable');expect(build).not.toHaveBeenCalled();
 });
});
