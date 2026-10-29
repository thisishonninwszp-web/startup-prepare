import {vi,it,expect,beforeEach} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc}}));
import {saveSchedule,claimSchedule,beginScheduleRequest,finishScheduleRun} from './commands';
import {loadScheduling} from './queries';
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
beforeEach(()=>rpc.mockReset());
it('normalizes config before save and rejects client URLs',async()=>{rpc.mockResolvedValue({data:{id},error:null});await saveSchedule(id,{configId:id,enabled:true,intervalMinutes:60,dailyBudget:2,requestId:id});expect(rpc).toHaveBeenCalledWith('save_observation_schedule',expect.objectContaining({p_config:{configId:id,enabled:true,intervalMinutes:60,dailyBudget:2,maxAttempts:3}}));});
it('requires complete owner context for targeted claims',async()=>{await expect(claimSchedule(null,id)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
it('sends lease token for each network authorization and atomic finish',async()=>{rpc.mockResolvedValue({data:{id,authorized:true},error:null});await beginScheduleRequest({id,token:id});await finishScheduleRun({id,token:id},true,{sourceType:'live'});expect(rpc).toHaveBeenLastCalledWith('finish_observation_run',expect.objectContaining({p_token:id,p_payload:{sourceType:'live'}}));});
it('reports missing migration rather than an empty healthy scheduler',async()=>{rpc.mockResolvedValue({data:null,error:{message:'Could not find function page_observation_scheduling in schema cache'}});expect(await loadScheduling(id)).toMatchObject({available:false});});
it('requires an affirmative network authorization before allowing fetch',async()=>{rpc.mockResolvedValue({data:null,error:null});await expect(beginScheduleRequest({id,token:id})).rejects.toThrow();});

