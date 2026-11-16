import {beforeEach,describe,it,expect,vi} from 'vitest';
const {getUser,enabled,command,read,cases,context,list}=vi.hoisted(()=>({getUser:vi.fn(),enabled:vi.fn(),command:vi.fn(),read:vi.fn(),cases:vi.fn(),context:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser}})}));vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:enabled}));vi.mock('@/lib/domains/business-teardowns/cash/transport',()=>({cashCommand:command,getCash:read,listCashCases:cases,loadCashContext:context,listCash:list}));
import {cashSaveAction,cashListAction,cashGetAction,cashCasesAction,cashContextAction} from './actions';
const id='10000000-0000-4000-8000-000000000001';
describe('cash authenticated actions',()=>{
 beforeEach(()=>{vi.clearAllMocks();enabled.mockReturnValue(true);getUser.mockResolvedValue({data:{user:{id}}});});
 it('rejects feature off and signed out calls before owner data',async()=>{enabled.mockReturnValue(false);await expect(cashListAction()).rejects.toThrow('尚未开启');enabled.mockReturnValue(true);getUser.mockResolvedValue({data:{user:null}});await expect(cashSaveAction({operation:'erase',id,requestId:id,expectedRevision:1})).rejects.toThrow('登录');expect(command).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();});
 it('derives owner from session on every operation',async()=>{const input={operation:'erase' as const,id,requestId:id,expectedRevision:1};await cashSaveAction(input);await cashListAction();await cashGetAction({id});await cashCasesAction();await cashContextAction({caseId:id});expect(command).toHaveBeenCalledWith(id,input);expect(list).toHaveBeenCalledWith(id,{});expect(read).toHaveBeenCalledWith(id,id);expect(cases).toHaveBeenCalledWith(id,{});expect(context).toHaveBeenCalledWith(id,id);expect(getUser).toHaveBeenCalledTimes(5);});
});
