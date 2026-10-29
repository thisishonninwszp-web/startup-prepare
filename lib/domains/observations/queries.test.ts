import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{from:m.from}}));
import {listTasks,getTask} from './queries';
const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
function query(data:unknown,error:unknown=null){
  const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),or:vi.fn(),lt:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data,error}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error}).then(resolve)};
  for(const name of ['select','eq','order','limit','or','lt'] as const)q[name].mockReturnValue(q);return q;
}
beforeEach(()=>vi.clearAllMocks());
it('uses owner filter, deterministic pages and only latest version per task',async()=>{
  const q=query(Array.from({length:31},(_,n)=>({id,created_at:`2026-10-${String(31-n).padStart(2,'0')}T00:00:00Z`,versions:[]})));m.from.mockReturnValue(q);
  const result=await listTasks(user,{objectType:'idea',objectId:id});
  expect(result.items).toHaveLength(30);expect(result.nextCursor).toBeTruthy();expect(q.eq).toHaveBeenCalledWith('user_id',user);
  expect(q.limit).toHaveBeenCalledWith(1,{referencedTable:'versions'});expect(q.limit).toHaveBeenCalledWith(31);
});
it('bounds full payload runs and versions and exposes continuation positions',async()=>{
  const task=query({id});const vs=query(Array.from({length:31},(_,n)=>({id,revision:40-n})));const rs=query(Array.from({length:6},()=>({id,created_at:'2026-10-26T00:00:00Z'})));
  m.from.mockReturnValueOnce(task).mockReturnValueOnce(vs).mockReturnValueOnce(rs);
  const result=await getTask(user,id,{versionBefore:50,runCursor:`2026-10-26T00:00:00Z|${id}`});
  expect(result.versions).toHaveLength(30);expect(result.runs).toHaveLength(5);expect(result.versionsNextBefore).toBe(11);expect(result.runsNextCursor).toBeTruthy();expect(vs.lt).toHaveBeenCalledWith('revision',50);expect(rs.or).toHaveBeenCalled();
});
it('returns missing only for its own missing schema and propagates permissions/network failures',async()=>{
  m.from.mockReturnValue(query(null,{code:'42P01',message:'relation decision_observation_tasks does not exist'}));expect((await listTasks(user)).status).toBe('missing-schema');
  m.from.mockReturnValue(query(null,{code:'42501',message:'permission denied decision_observation_tasks'}));await expect(listTasks(user)).rejects.toThrow('permission denied');
  const q=query(null);m.from.mockReturnValue(q);await expect(listTasks(user,{cursor:'garbage'})).rejects.toThrow();expect(q.limit).toHaveBeenCalledTimes(1);
});
