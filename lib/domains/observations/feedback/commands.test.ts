import {vi,it,expect,beforeEach} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc}}));
import {saveFeedback,saveFeedbackLink} from './commands';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue({data:{id},error:null});});
it('sends validation ID without client signals or content',async()=>{await saveFeedback(id,{ideaId:id,requestId:id,sourceKind:'validation',validationId:id,roleContext:'one person',interpretation:'uncertain'});expect(rpc).toHaveBeenCalledWith('save_decision_feedback',expect.objectContaining({p_user_id:id,p_payload:expect.objectContaining({validationId:id})}));expect(rpc.mock.calls[0][1].p_payload).not.toHaveProperty('sourceNote');});
it('rejects forged manual signals before database',async()=>{await expect(saveFeedback(id,{ideaId:id,requestId:id,sourceKind:'no_reply',roleContext:'mail',interpretation:'unknown',has_pain:'no'} as never)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
it('preserves expected link version and propagates stale rejection',async()=>{rpc.mockResolvedValue({error:{message:'stale feedback link'},data:null});await expect(saveFeedbackLink(id,{feedbackId:id,targetIdeaId:id,requestId:id,expectedLinkId:id,action:'retract',assumption:'',scope:'',limits:'',unknown:''})).rejects.toThrow('stale');});
