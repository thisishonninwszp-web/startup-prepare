import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),list:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:h.enabled}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:h.user}})}));
vi.mock('@/lib/domains/business-teardowns/history/transport',()=>({listConfirmationHistory:h.list,getConfirmationNode:h.get}));
import {confirmationHistoryListAction,confirmationHistoryGetAction} from './actions';
describe('confirmation history authenticated reads',()=>{
 beforeEach(()=>{vi.clearAllMocks();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:{id:'owner'}}});});
 it('gates both read actions independently before transport',async()=>{const reads=[()=>confirmationHistoryListAction(),()=>confirmationHistoryGetAction({kind:'result',id:'id'})];h.enabled.mockReturnValue(false);for(const read of reads)await expect(read()).rejects.toThrow('尚未开启');h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:null}});for(const read of reads)await expect(read()).rejects.toThrow('请先登录');expect(h.list).not.toHaveBeenCalled();expect(h.get).not.toHaveBeenCalled();});
 it('passes only authenticated owner and unchanged exact key/filter',async()=>{await confirmationHistoryListAction({caseId:'case',before:'cursor'});await confirmationHistoryGetAction({kind:'plan',id:'plan',revision:3});expect(h.list).toHaveBeenCalledWith('owner',{caseId:'case',before:'cursor'});expect(h.get).toHaveBeenCalledWith('owner',{kind:'plan',id:'plan',revision:3});});
});
