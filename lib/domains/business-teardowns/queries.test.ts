import {describe,expect,it,vi,beforeEach} from 'vitest';
const mocked=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdmin:mocked}));
import {getBusinessSchemaStatus,listCaseHistory,loadDailyCase,loadCaseDetail} from './queries';
const owner='10000000-0000-4000-8000-000000000001';
beforeEach(()=>vi.clearAllMocks());
describe('business reads',()=>{
 it('uses authoritative database Tokyo day',async()=>{mocked.rpc.mockResolvedValue({data:null,error:null});expect(await loadDailyCase(owner)).toBeNull();expect(mocked.rpc).toHaveBeenCalledWith('business_load_today',{p_user_id:owner});});
 it('fetches a lookahead page with owner and exclusive date cursor',async()=>{const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),lt:vi.fn(),then:undefined};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.order.mockReturnValue(q);q.limit.mockReturnValue(q);q.lt.mockResolvedValue({data:Array.from({length:21},(_,i)=>({id:String(i),local_date:`2026-10-${String(28-i).padStart(2,'0')}`,state:'preparing',revision:1,merchant_id:'shop',selection_reason:'confirmed'})),error:null});mocked.from.mockReturnValue(q);const result=await listCaseHistory(owner,'2026-10-29');expect(result.items).toHaveLength(20);expect(result.nextCursor).toBe('2026-10-09');expect(q.eq).toHaveBeenCalledWith('user_id',owner);expect(q.lt).toHaveBeenCalledWith('local_date','2026-10-29');expect(q.limit).toHaveBeenCalledWith(21);});
 it('returns no cross owner detail and never fetches its materials',async()=>{const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);mocked.from.mockReturnValue(q);expect(await loadCaseDetail(owner,'20000000-0000-4000-8000-000000000001')).toBeNull();expect(mocked.from).toHaveBeenCalledTimes(1);});
 it('only treats absent foundation schema as unavailable',async()=>{const limit=vi.fn().mockResolvedValue({error:{code:'42P01',message:'absent'}});mocked.from.mockReturnValue({select:()=>({limit})});expect(await getBusinessSchemaStatus()).toBe(false);limit.mockResolvedValue({error:{code:'NETWORK',message:'offline'}});await expect(getBusinessSchemaStatus()).rejects.toThrow('offline');});
 it('reads all immutable materials in stable pages and batch joins',async()=>{
  const range=vi.fn().mockImplementation((offset:number)=>Promise.resolve({data:offset===0?Array.from({length:100},(_,i)=>({role:'primary',snapshot_id:`s${i}`,merchant_id:'m'})):[{role:'product',snapshot_id:'old-source',merchant_id:'m'}],error:null}));
  const memberQuery={select:vi.fn(),eq:vi.fn(),order:vi.fn(),range};memberQuery.select.mockReturnValue(memberQuery);memberQuery.eq.mockReturnValue(memberQuery);memberQuery.order.mockReturnValue(memberQuery);
  const snapshotIn=vi.fn().mockImplementation((_key:string,ids:string[])=>Promise.resolve({data:ids.map(id=>({id,merchant_id:'m'})),error:null}));
  const sourceQuery={select:vi.fn(),eq:vi.fn(),in:snapshotIn};sourceQuery.select.mockReturnValue(sourceQuery);sourceQuery.eq.mockReturnValue(sourceQuery);
  function singleQuery(data:object){const q={select:vi.fn(),eq:vi.fn(),single:vi.fn().mockResolvedValue({data,error:null}),maybeSingle:vi.fn().mockResolvedValue({data,error:null})};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);return q;}
  const merchantQuery={...singleQuery({id:'m'}),in:vi.fn().mockResolvedValue({data:[{id:'m'}],error:null})};merchantQuery.select.mockReturnValue(merchantQuery);merchantQuery.eq.mockReturnValue(merchantQuery);
  mocked.from.mockImplementation(table=>table==='business_daily_cases'?singleQuery({id:'case',merchant_id:'m'}):table==='business_case_members'?memberQuery:table==='business_material_snapshots'?sourceQuery:merchantQuery);
  const detail=await loadCaseDetail(owner,'20000000-0000-4000-8000-000000000001');expect(detail?.members).toHaveLength(101);expect(detail?.members[100].snapshot.id).toBe('old-source');expect(range).toHaveBeenNthCalledWith(2,100,199);expect(memberQuery.order).toHaveBeenCalledWith('snapshot_id');expect(snapshotIn).toHaveBeenCalledTimes(2);
 });
});
