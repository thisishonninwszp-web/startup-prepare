import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc:m.rpc}}));
import { createTask,saveRun,attachRunToGap } from './commands';
const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue({data:{id},error:null});});
it('passes server user and explicit idea binding to atomic version RPC',async()=>{
  await createTask(user,{objectType:'idea',objectId:id,requestId:id,config:{question:'q',decisionToChange:'d',stopCondition:'s'}});
  expect(m.rpc).toHaveBeenCalledWith('save_decision_observation_version',expect.objectContaining({p_user_id:user,p_object_id:id,p_task_id:null,p_config:expect.objectContaining({mode:'manual',resources:null})}));
});
it('preserves normalized provider metrics and missing values without fake costs',async()=>{
  await saveRun(user,{taskId:id,taskVersionId:id,requestId:id,run:{status:'success',records:[{title:'range',text:'10–100',origin:'manual',value:null,data:{lowerBound:10,upperBound:100,state:'range'},providerMetadata:{provider:'ads_planner'}}]}});
  const p=m.rpc.mock.calls[0][1].p_payload;
  expect(p.costMinor).toBeNull();expect(p.currency).toBeNull();
  expect(p.records[0]).toMatchObject({value:null,data:{lowerBound:10,upperBound:100,state:'range'}});
});
it('rejects invalid records before database access and surfaces database failures',async()=>{
  await expect(saveRun(user,{taskId:id,taskVersionId:id,requestId:id,run:{status:'failed',records:[],resultState:'zero'}})).rejects.toThrow();
  expect(m.rpc).not.toHaveBeenCalled();m.rpc.mockResolvedValue({data:null,error:{message:'version unavailable'}});
  await expect(attachRunToGap(user,{gapId:id,runId:id,requestId:id})).rejects.toThrow('version unavailable');
});
