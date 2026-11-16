import {beforeEach,describe,it,expect,vi} from 'vitest';
const {getUser,enabled,command,read,cases,context,apprenticeships,list}=vi.hoisted(()=>({getUser:vi.fn(),enabled:vi.fn(),command:vi.fn(),read:vi.fn(),cases:vi.fn(),context:vi.fn(),apprenticeships:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser}})}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:enabled}));
vi.mock('@/lib/domains/business-teardowns/practice/transport',()=>({practiceCommand:command,getPractice:read,listPracticeCases:cases,loadPracticeContext:context,listPracticeApprenticeships:apprenticeships,listPractices:list}));
import {savePracticeAction,loadPracticesAction,loadPracticeRecordAction,loadPracticeCasesAction,loadPracticeContextAction,loadPracticeApprenticeshipsAction} from './actions';
const id='10000000-0000-4000-8000-000000000001';
describe('practice actions authenticate every read and mutation',()=>{
 beforeEach(()=>{vi.clearAllMocks();enabled.mockReturnValue(true);getUser.mockResolvedValue({data:{user:{id}}});});
 it('rejects disabled and signed-out calls before touching owner data',async()=>{enabled.mockReturnValue(false);await expect(loadPracticesAction()).rejects.toThrow('尚未开启');enabled.mockReturnValue(true);getUser.mockResolvedValue({data:{user:null}});await expect(savePracticeAction({operation:'erase',id,requestId:id,expectedRevision:1})).rejects.toThrow('登录');expect(command).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();});
 it('derives owner only from authenticated session for the complete workflow',async()=>{const input={operation:'erase' as const,id,requestId:id,expectedRevision:1};await savePracticeAction(input);await loadPracticesAction();await loadPracticeRecordAction(id);await loadPracticeCasesAction();await loadPracticeContextAction(id);await loadPracticeApprenticeshipsAction({caseId:id});expect(command).toHaveBeenCalledWith(id,input);expect(list).toHaveBeenCalledWith(id,{});expect(read).toHaveBeenCalledWith(id,id);expect(cases).toHaveBeenCalledWith(id,{});expect(context).toHaveBeenCalledWith(id,id);expect(apprenticeships).toHaveBeenCalledWith(id,{caseId:id});expect(getUser).toHaveBeenCalledTimes(6);});
});
