import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getUser:vi.fn(),createTask:vi.fn(),saveRun:vi.fn(),revalidate:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:m.getUser}})}));
vi.mock('@/lib/domains/observations/commands',()=>({createTask:m.createTask,updateTask:vi.fn(),saveRun:m.saveRun,attachRunToGap:vi.fn()}));
vi.mock('@/lib/domains/observations/queries',()=>({listTasks:vi.fn(),getTask:vi.fn()}));
import {createObservationTask,saveObservationRun} from './observation-actions';
const input={objectType:'idea' as const,objectId:'idea',requestId:'req',config:{question:'q',decisionToChange:'d',stopCondition:'s'}};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DECISION_OBSERVATIONS_ENABLED','true');m.getUser.mockResolvedValue({data:{user:{id:'actual-session-user'}}});m.createTask.mockResolvedValue({id:'v',taskId:'t'});});
it('uses session owner and preserves stable request identity',async()=>{
  expect(await createObservationTask(input)).toEqual({id:'v',taskId:'t'});
  expect(m.createTask).toHaveBeenCalledWith('actual-session-user',input);
});
it('rejects disabled and anonymous actions before mutation',async()=>{
  vi.stubEnv('DECISION_OBSERVATIONS_ENABLED','false');await expect(createObservationTask(input)).rejects.toThrow('尚未启用');expect(m.createTask).not.toHaveBeenCalled();
  vi.stubEnv('DECISION_OBSERVATIONS_ENABLED','true');m.getUser.mockResolvedValue({data:{user:null}});await expect(createObservationTask(input)).rejects.toThrow('未登录');
});
it('does not refresh or erase a failed write',async()=>{
  m.saveRun.mockRejectedValue(new Error('request payload conflict'));
  await expect(saveObservationRun({taskId:'t',taskVersionId:'v',requestId:'r',run:{status:'success',records:[]}})).rejects.toThrow('request payload conflict');expect(m.revalidate).not.toHaveBeenCalled();
});
