import {vi,it,expect,beforeEach} from 'vitest';
const {getUser,save,revalidate}=vi.hoisted(()=>({getUser:vi.fn(),save:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser}})}));vi.mock('next/cache',()=>({revalidatePath:revalidate}));vi.mock('@/lib/domains/observations/feedback/commands',()=>({saveFeedback:save,saveFeedbackLink:save}));vi.mock('@/lib/domains/observations/feedback/queries',()=>({}));
import {saveFeedbackAction} from './feedback-actions';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const input={ideaId:id,requestId:id,sourceKind:'no_reply' as const,roleContext:'mail',interpretation:'unknown'};
beforeEach(()=>{vi.stubEnv('FEEDBACK_LEARNING_ENABLED','true');getUser.mockResolvedValue({data:{user:{id}}});save.mockReset();save.mockResolvedValue({id});revalidate.mockClear();});
it('takes owner from session and invalidates only after save',async()=>{expect(await saveFeedbackAction(input)).toEqual({ok:true,id});expect(save).toHaveBeenCalledWith(id,input);expect(revalidate).toHaveBeenCalledWith('/workbench');});
it('disabled feature cannot write',async()=>{vi.stubEnv('FEEDBACK_LEARNING_ENABLED','false');expect((await saveFeedbackAction(input)).ok).toBe(false);expect(save).not.toHaveBeenCalled();});
it('anonymous session cannot write',async()=>{getUser.mockResolvedValue({data:{user:null}});expect((await saveFeedbackAction(input)).ok).toBe(false);expect(save).not.toHaveBeenCalled();});
