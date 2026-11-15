import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/supabase',()=>{const client={rpc:vi.fn()};return {supabaseAdmin:client,supabaseAdminUncached:client};});
vi.mock('@/lib/ai',()=>({generateBusinessTeardownReport:vi.fn(),MODEL:'mock',BUSINESS_REPORT_PROMPT_VERSION:'v1'}));
import {executeBusinessJob,type JobDependencies} from './executor';
import {AUTO_POLICY_VERSION,type QueuedCandidate} from '../rules';
import type {JobLease} from './types';
import {RakutenItemNotFoundError,type searchBusinessCandidates} from '../providers/rakuten';
import {SECTION_KEYS} from '../report-domain';
import {filterBusinessReport} from '../report-partial';
function fixture(){
 const run={runId:'run',leaseToken:'lease',status:'running',localDate:'2026-10-29',caseId:null,materialStatus:'pending',reportStatus:'pending',reportRequestId:'report-request',settings:{enabled:true,prepareOnOpen:false,schedule:'07:00',httpBudget:8,aiBudget:1,sources:[{mode:'search',keyword:'道具',category:'tools',priceBand:'mixed',businessModel:'retail'}],excluded:[],autoAI:false,policyVersion:AUTO_POLICY_VERSION,revision:1}} as JobLease;
 const merchant={platform:'rakuten',platformShopId:'tools',name:'Tools',sourceUrl:'https://www.rakuten.co.jp/tools/',identityScope:'platform_shop_id'} as const;
 const candidate={merchant,itemCode:'tools:item',itemName:'Tool',itemUrl:'https://item.rakuten.co.jp/tools/item/',price:{itemPrice:100},reviewCount:null,rank:null,coverage:'page=1'};
 let queued:unknown[]=[];const events:string[]=[];const command=vi.fn<(op:string,input?:Record<string,unknown>)=>Promise<unknown>>(async(op:string,input:Record<string,unknown>={})=>{events.push(op);if(op==='claim')return run;if(op==='enqueue'){queued=input.candidates as unknown[];return run;}if(op==='state')return {candidates:queued,history:{excluded:[],priorMain:[],recent:[]}};if(op==='ticket')return {id:'ticket'};if(op==='reserve')return {...run,caseId:'case',candidate:input.candidate};if(op==='material')return {...run,caseId:'case',materialStatus:'ready'};if(op==='ai_start')return {status:'not_permitted'};if(op==='complete')return {status:'materials_ready'};if(op==='fail')return {status:'failed',message:input.message};return run;});
 const search=vi.fn<typeof searchBusinessCandidates>(async(input)=>{await input.beforeRequest?.();events.push('http');return {items:[candidate],coverage:'page=1',nextCursor:null};});
 const inspect=vi.fn<JobDependencies['inspect']>(async(_code,options={})=>{await options.beforeRequest?.();events.push('inspectHttp');return {merchant,snapshot:{platform:'rakuten',itemId:'tools:item',origin:'official_api',sourceUrl:candidate.itemUrl,publishedAt:null,captureScope:'api_fields',capturedText:null,quantities:[],structured:{itemName:'Tool',query:{itemCode:'tools:item'},privateNested:{body:'secret'}},coverage:'official'}};});
 const deps={command,search,inspect,generate:vi.fn(),enabled:()=>true,aiEnabled:()=>false,draftsAvailable:async()=>true,allowedOwner:async()=>true,sleep:vi.fn(),now:()=>new Date('2026-10-29T00:00:00Z')} as unknown as JobDependencies;
 return {deps,command,search,inspect,events,run};
}
function queued(shop:string,capturedAt:string):QueuedCandidate{return {merchant:{platform:'rakuten',platformShopId:shop,name:shop,sourceUrl:`https://www.rakuten.co.jp/${shop}/`,identityScope:'platform_shop_id'},itemCode:`${shop}:item`,itemName:'Tool',itemUrl:`https://item.rakuten.co.jp/${shop}/item/`,price:{itemPrice:100},reviewCount:null,rank:null,coverage:'page=1',category:'tools',priceBand:'mixed',businessModel:'retail',sourcePage:1,capturedAt};}
function withQueue(f:ReturnType<typeof fixture>,candidates:QueuedCandidate[]){const original=f.command.getMockImplementation()!;f.command.mockImplementation(async(op,input)=>op==='state'?{candidates,history:{excluded:[],priorMain:[],recent:[]}}:original(op,input));}
describe('controlled business job executor',()=>{
 it('settles once and saves structural quarantine as a draft without publishing or resending',async()=>{
  const f=fixture();f.run.settings.autoAI=true;f.deps.aiEnabled=()=>true;const original=f.command.getMockImplementation()!;
  f.command.mockImplementation(async(op,input)=>{if(op==='ai_start')return {status:'ready',lease:{caseId:'case',requestId:'report-request'},sources:[]};if(op==='verify_ai')return {sources:[]};if(op==='finish_draft')return {status:'draft_ready',reportId:'draft'};return original(op,input);});
  const sections=SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['未知']}));Object.assign(sections[11],{distinguishingObservation:'访谈实际购买者'});
  vi.mocked(f.deps.generate).mockResolvedValue(filterBusinessReport({sections},[]));
  expect(await executeBusinessJob('owner','cron',f.deps)).toMatchObject({status:'draft_ready'});
  const report=f.command.mock.calls.find(([op])=>op==='finish_draft')![1]!.report as {sections:{validationGaps?:{rule:string}[]}[]};
  expect(report.sections[11].validationGaps?.[0].rule).toBe('unexpected_field');
  expect(f.deps.generate).toHaveBeenCalledTimes(1);expect(f.command.mock.calls.some(([op])=>op==='finish'||op==='fail')).toBe(false);
  expect(f.command.mock.calls.filter(([op,input])=>op==='settle'&&input?.status==='completed'&&input?.ticketId==='ticket').length).toBeGreaterThan(0);
 });
 it('keeps the reserved merchant identity when fresh official display metadata changes',async()=>{
  const f=fixture();const inspect=f.inspect.getMockImplementation()!;
  f.inspect.mockImplementation(async(...args)=>{const item=await inspect(...args);return {...item,merchant:{...item.merchant,name:'Tools 官方店 · 新名称',sourceUrl:'https://www.rakuten.co.jp/tools/?tracking=latest'},snapshot:{...item.snapshot,structured:{...item.snapshot.structured,shopName:'Tools 官方店 · 新名称'}}};});
  const command=f.command.getMockImplementation()!;
  f.command.mockImplementation(async(op,input)=>{if(op==='material'&&JSON.stringify(input?.merchant)!==JSON.stringify({platform:'rakuten',platformShopId:'tools',name:'Tools',sourceUrl:'https://www.rakuten.co.jp/tools/',identityScope:'platform_shop_id'}))throw new Error('automatic material must be official public scalar fields');return command(op,input);});
  expect(await executeBusinessJob('owner','cron',f.deps)).toMatchObject({status:'materials_ready'});
  const material=f.command.mock.calls.find(([op])=>op==='material')![1]!;
  expect(material.merchant).toEqual({platform:'rakuten',platformShopId:'tools',name:'Tools',sourceUrl:'https://www.rakuten.co.jp/tools/',identityScope:'platform_shop_id'});
  expect((material.snapshot as {structured:Record<string,unknown>}).structured.shopName).toBe('Tools 官方店 · 新名称');
  expect(f.inspect).toHaveBeenCalledTimes(1);expect(f.deps.generate).not.toHaveBeenCalled();
 });
 it('rejects changed merchant or item identities before storing or generating',async()=>{
  for(const mutation of ['shop','item','shop-url','item-url','scope'] as const){
   const f=fixture();const inspect=f.inspect.getMockImplementation()!;
   f.inspect.mockImplementation(async(...args)=>{const item=await inspect(...args);return {...item,merchant:{...item.merchant,...(mutation==='shop'?{platformShopId:'other'}:{}),...(mutation==='shop-url'?{sourceUrl:'https://www.rakuten.co.jp/other/'}:{}),...(mutation==='scope'?{identityScope:'user_supplied_unverified'}:{})},snapshot:{...item.snapshot,...(mutation==='item'?{itemId:'tools:other'}:{}),...(mutation==='item-url'?{sourceUrl:'https://item.rakuten.co.jp/other/item/'}:{})}} as typeof item;});
   expect((await executeBusinessJob('owner','cron',f.deps)).status).toBe('failed');
   expect(f.command.mock.calls.some(([op])=>op==='material')).toBe(false);expect(f.deps.generate).not.toHaveBeenCalled();
  }
 });
 it('does not reserve a candidate from an earlier ranking day; fetches today first',async()=>{
  // 2026-10-28T14:30Z is 23:30 the day before in Tokyo. It would win the ordering (aaa < tools) if it counted.
  const f=fixture();withQueue(f,[queued('aaa','2026-10-28T14:30:00Z')]);
  expect((await executeBusinessJob('owner','cron',f.deps)).status).toBe('materials_ready');
  expect(f.search).toHaveBeenCalledTimes(1);
  expect(f.command.mock.calls.find(([op])=>op==='reserve')![1]).toMatchObject({candidate:{itemCode:'tools:item'}});
 });
 it('uses a candidate seen earlier the same Tokyo day without fetching again',async()=>{
  // 2026-10-28T15:30Z is 00:30 on 10-29 in Tokyo, the run's day.
  const f=fixture();withQueue(f,[queued('aaa','2026-10-28T14:30:00Z'),queued('tools','2026-10-28T15:30:00Z')]);
  expect((await executeBusinessJob('owner','cron',f.deps)).status).toBe('materials_ready');
  expect(f.search).not.toHaveBeenCalled();
  expect(f.command.mock.calls.find(([op])=>op==='reserve')![1]).toMatchObject({candidate:{itemCode:'tools:item',capturedAt:'2026-10-28T15:30:00Z'}});
 });
 it('does not retry an item search no longer returns, and says why',async()=>{
  const f=fixture();f.inspect.mockImplementation(async(_code,options={})=>{await options.beforeRequest?.();throw new RakutenItemNotFoundError();});
  const result=await executeBusinessJob('owner','cron',f.deps);
  expect(result).toMatchObject({status:'failed'});expect(result.message).toContain('今天不换店');
  expect(f.inspect).toHaveBeenCalledTimes(1);expect(f.deps.sleep).not.toHaveBeenCalled();
  expect(f.command.mock.calls.filter(([op,input])=>op==='ticket'&&input?.stage==='inspect')).toHaveLength(1);
  expect(f.command.mock.calls.some(([op])=>op==='material')).toBe(false);expect(f.deps.generate).not.toHaveBeenCalled();
 });
 it('distinguishes a disabled account from a disabled deployment',async()=>{const f=fixture();f.command.mockImplementationOnce(async()=>({status:'disabled'}));expect(await executeBusinessJob('owner','cron',f.deps)).toMatchObject({status:'disabled',message:'账号任务设置未允许本次执行'});expect(f.search).not.toHaveBeenCalled();});
 it('blocks non-owner daily preparation before any work',async()=>{const f=fixture();f.deps.allowedOwner=async()=>false;expect((await executeBusinessJob('stranger','manual',f.deps)).status).toBe('owner_only');expect(f.command).not.toHaveBeenCalled();expect(f.search).not.toHaveBeenCalled();expect(f.deps.generate).not.toHaveBeenCalled();});
 it('atomically saves a partial report as a draft instead of discarding it or publishing',async()=>{
  const f=fixture();f.run.settings.autoAI=true;f.deps.aiEnabled=()=>true;const original=f.command.getMockImplementation()!;
  f.command.mockImplementation(async(op,input)=>{if(op==='ai_start')return {status:'ready',lease:{caseId:'case',requestId:'report-request'},sources:[]};if(op==='verify_ai')return {sources:[]};if(op==='finish_draft')return {status:'draft_ready',reportId:'draft'};return original(op,input);});
  vi.mocked(f.deps.generate).mockResolvedValue(SECTION_KEYS.map((key,index)=>({key,observations:[],interpretations:[],unknowns:index?['未知']:[],...(index?{}:{validationGaps:[{field:'unknowns' as const,reason:'content_rejected' as const,count:1}]})})));
  expect(await executeBusinessJob('owner','manual',f.deps)).toMatchObject({status:'draft_ready',reportId:'draft'});
  expect(f.command.mock.calls.some(([op])=>op==='finish')).toBe(false);expect(f.command.mock.calls.some(([op])=>op==='fail')).toBe(false);expect(f.deps.generate).toHaveBeenCalledTimes(1);const ops=f.command.mock.calls.map(([op])=>op);expect(ops.lastIndexOf('settle')).toBeLessThan(ops.indexOf('finish_draft'));
 });
 it('does no work before the draft migration is available',async()=>{const f=fixture();f.deps.draftsAvailable=async()=>false;expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('schema_required');expect(f.command).not.toHaveBeenCalled();expect(f.deps.generate).not.toHaveBeenCalled();expect(f.search).not.toHaveBeenCalled();});
 it('gets an HTTP ticket immediately before each transport, reserves before inspection, and keeps AI off',async()=>{const f=fixture();expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('materials_ready');expect(f.events.indexOf('ticket')).toBeLessThan(f.events.indexOf('http'));expect(f.events.indexOf('reserve')).toBeLessThan(f.events.indexOf('inspectHttp'));expect(f.deps.generate).not.toHaveBeenCalled();const material=f.command.mock.calls.find(([op])=>op==='material')![1];expect(JSON.stringify(material)).not.toContain('secret');expect(JSON.stringify(material)).not.toContain('query');});
 it('returns terminal or busy receipt before outbound work',async()=>{const f=fixture();f.command.mockImplementationOnce(async()=>({status:'completed',reportId:'report'}));expect((await executeBusinessJob('owner','cron',f.deps)).status).toBe('completed');expect(f.search).not.toHaveBeenCalled();});
 it('refuses in-flight HTTP result after settings withdrawal',async()=>{const f=fixture();let httpCompleted=false;f.search.mockImplementationOnce(async(input)=>{await input.beforeRequest?.();httpCompleted=true;return {items:[],coverage:'page',nextCursor:null};});f.command.mockImplementation(async(op)=>{if(op==='claim')return f.run;if(op==='state')return {candidates:[],history:{excluded:[],priorMain:[],recent:[]}};if(op==='check'&&httpCompleted)throw new Error('settings revoked');if(op==='ticket')return {id:'t'};return {status:'failed'};});await executeBusinessJob('owner','manual',f.deps);expect(f.command.mock.calls.some(([op])=>op==='enqueue')).toBe(false);expect(f.inspect).not.toHaveBeenCalled();});
 it('follows source nextCursor without a local page cap',async()=>{const f=fixture();f.search.mockImplementation(async(input)=>{await input.beforeRequest?.();return {items:[],coverage:'page',nextCursor:(input as {page?:number}).page===1?'2':null};});await executeBusinessJob('owner','manual',f.deps);expect(f.search).toHaveBeenCalledTimes(2);expect(f.search.mock.calls[1][0]).toMatchObject({page:2});});
 it('reserves a usable first-page merchant without draining the whole provider search',async()=>{const f=fixture();const original=f.search.getMockImplementation()!;f.search.mockImplementationOnce(async input=>({...await original(input),nextCursor:'2'}));expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('materials_ready');expect(f.search).toHaveBeenCalledTimes(1);expect(f.inspect).toHaveBeenCalledTimes(1);});
 it('leaves one HTTP ticket for the selected shop inspection',async()=>{const f=fixture();f.run.settings.httpBudget=2;expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('materials_ready');expect(f.search).toHaveBeenCalledTimes(1);expect(f.inspect).toHaveBeenCalledTimes(1);});
 it('does not discover with insufficient inspection credit and checkpoints empty pages',async()=>{const one=fixture();one.run.settings.httpBudget=1;expect((await executeBusinessJob('owner','manual',one.deps)).status).toBe('failed');expect(one.search).not.toHaveBeenCalled();const three=fixture();three.run.settings.httpBudget=3;three.search.mockImplementation(async input=>{await input.beforeRequest?.();return {items:[],coverage:'empty page',nextCursor:String((input.page??1)+1)};});expect((await executeBusinessJob('owner','manual',three.deps)).status).toBe('failed');expect(three.search).toHaveBeenCalledTimes(2);expect(three.inspect).not.toHaveBeenCalled();expect(three.command.mock.calls.filter(([op])=>op==='enqueue').at(-1)![1]).toMatchObject({sourceCursor:{nextPage:3}});});
 it('bounds failed HTTP attempts and preserves explicit independent failure',async()=>{const f=fixture();f.search.mockImplementation(async(input)=>{await input.beforeRequest?.();throw new Error('source unavailable');});const result=await executeBusinessJob('owner','manual',f.deps);expect(result.status).toBe('failed');expect(f.search).toHaveBeenCalledTimes(3);expect(f.deps.sleep).toHaveBeenCalledTimes(2);expect(f.command.mock.calls.filter(([op])=>op==='ticket')).toHaveLength(3);});
 it('does not attempt anything when global jobs are disabled',async()=>{const f=fixture();f.deps.enabled=()=>false;expect(await executeBusinessJob('owner','manual',f.deps)).toMatchObject({status:'disabled',message:'部署任务开关尚未开启'});expect(f.command).not.toHaveBeenCalled();});
 it('publishes AI only through final atomic operation after both source/consent checks',async()=>{const f=fixture();f.run.settings.autoAI=true;f.deps.aiEnabled=()=>true;const original=f.command.getMockImplementation()!;f.command.mockImplementation(async(op,input)=>{if(op==='ai_start')return {status:'ready',lease:{caseId:'case',requestId:'report-request'},sources:[]};if(op==='verify_ai')return {sources:[]};if(op==='finish')return {status:'completed'};return original(op,input);});vi.mocked(f.deps.generate).mockResolvedValue(SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['未知']})));expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('completed');expect(f.command.mock.calls.filter(([op])=>op==='verify_ai')).toHaveLength(2);expect(f.command.mock.calls.filter(([op])=>op==='ticket').at(-1)![1]).toMatchObject({kind:'ai'});expect(f.deps.generate).toHaveBeenCalledTimes(1);});
 it('does not resend an unknown AI request or publish an in-flight result after flag withdrawal',async()=>{const f=fixture();f.run.settings.autoAI=true;f.deps.aiEnabled=()=>true;const original=f.command.getMockImplementation()!;let failed=false;f.command.mockImplementation(async(op,input)=>{if(op==='claim'&&failed)return {status:'unknown'};if(op==='ai_start')return {status:'ready',lease:{caseId:'case',requestId:'report-request'},sources:[]};if(op==='verify_ai')return {sources:[]};if(op==='fail'){failed=true;return {status:'unknown'};}return original(op,input);});vi.mocked(f.deps.generate).mockImplementation(async()=>{f.deps.aiEnabled=()=>false;return SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['未知']}));});expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('unknown');expect((await executeBusinessJob('owner','manual',f.deps)).status).toBe('unknown');expect(f.deps.generate).toHaveBeenCalledTimes(1);expect(f.command.mock.calls.some(([op])=>op==='finish')).toBe(false);});
});



