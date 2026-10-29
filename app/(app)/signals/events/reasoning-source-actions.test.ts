import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),list:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:m.auth}})}));
vi.mock('@/lib/domains/observations/reasoning-sources',()=>({listReasoningSources:m.list,getReasoningSource:m.get}));
import {listReasoningSourcesAction,getReasoningSourceAction} from './reasoning-source-actions';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('REASONING_ATTENTION_ENABLED','true');vi.stubEnv('SIGNAL_EVENTS_ENABLED','true');m.auth.mockResolvedValue({data:{user:{id:'owner'}},error:null});});
it('任一开关关闭时不读取私人来源',async()=>{vi.stubEnv('SIGNAL_EVENTS_ENABLED','false');await expect(listReasoningSourcesAction('event')).rejects.toThrow('尚未启用');expect(m.list).not.toHaveBeenCalled();});
it('详情只接受登录owner，不由客户端传userId',async()=>{await getReasoningSourceAction('event','snapshot');expect(m.get).toHaveBeenCalledWith('owner','event','snapshot');});
it('登录失败拒绝读取',async()=>{m.auth.mockResolvedValue({data:{user:null},error:null});await expect(listReasoningSourcesAction('event')).rejects.toThrow('未登录');expect(m.list).not.toHaveBeenCalled();});
