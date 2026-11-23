import {beforeEach,describe,it,expect,vi} from 'vitest';
const {getUser,read,command}=vi.hoisted(()=>({getUser:vi.fn(),read:vi.fn(),command:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser}})}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:()=>process.env.BUSINESS_TEARDOWNS_ENABLED==='true'}));
vi.mock('@/lib/domains/business-teardowns/withdrawals/transport',()=>({withdrawalRead:read,withdrawalCommand:command}));
import {loadWithdrawalAction,withdrawalCommandAction} from './actions';
const id='10000000-0000-4000-8000-000000000001';
describe('withdrawal actions authorization',()=>{
 beforeEach(()=>{vi.clearAllMocks();process.env.BUSINESS_TEARDOWNS_ENABLED='true';getUser.mockResolvedValue({data:{user:{id}}});});
 it('derives owner from login and forwards exact command',async()=>{const input={operation:'erase',id,requestId:id,expectedRevision:1} as const;await withdrawalCommandAction(input);expect(command).toHaveBeenCalledWith(id,input);});
 it('blocks anonymous and disabled feature before any read or write',async()=>{getUser.mockResolvedValue({data:{user:null}});await expect(loadWithdrawalAction(id)).rejects.toThrow('登录');process.env.BUSINESS_TEARDOWNS_ENABLED='false';await expect(withdrawalCommandAction({operation:'select_today',requestId:id})).rejects.toThrow();expect(read).not.toHaveBeenCalled();expect(command).not.toHaveBeenCalled();});
 it('validates command independently and rejects injected owner',async()=>{await expect(withdrawalCommandAction({operation:'erase',id,requestId:id,expectedRevision:1,user_id:id} as never)).rejects.toThrow();expect(command).not.toHaveBeenCalled();});
});
