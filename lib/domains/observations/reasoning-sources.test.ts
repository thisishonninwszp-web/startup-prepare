import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({from:vi.fn(),chain:{} as Record<string,ReturnType<typeof vi.fn>>}));
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{from:m.from}}));
import {listReasoningSources,getReasoningSource} from './reasoning-sources';
const user='11111111-1111-4111-8111-111111111111',event='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
beforeEach(()=>{vi.clearAllMocks();for(const name of ['select','eq','order','gt'])m.chain[name]=vi.fn(()=>m.chain);m.chain.limit=vi.fn().mockResolvedValue({data:[{id,title:'标题',source_url:null,captured_at:'2026-10-27'}],error:null});m.chain.maybeSingle=vi.fn().mockResolvedValue({data:{id,title:'标题',captured_text:'实际原文',source_url:null,captured_at:'2026-10-27'},error:null});m.from.mockReturnValue(m.chain);});
it('历史来源按snapshot分页，并在SQL查询同时检查快照与成员归属',async()=>{const result=await listReasoningSources(user,event,id);expect(result.items[0].id).toBe(id);expect(m.chain.eq).toHaveBeenCalledWith('user_id',user);expect(m.chain.eq).toHaveBeenCalledWith('memberships.user_id',user);expect(m.chain.eq).toHaveBeenCalledWith('memberships.event_id',event);expect(m.chain.eq).toHaveBeenCalledWith('memberships.action','include');expect(m.chain.gt).toHaveBeenCalledWith('id',id);});
it('来源详情单独读取原文，错误不变成空材料',async()=>{expect((await getReasoningSource(user,event,id)).captured_text).toBe('实际原文');m.chain.maybeSingle.mockResolvedValue({data:null,error:{message:'database unavailable'}});await expect(getReasoningSource(user,event,id)).rejects.toThrow('database unavailable');});
it('坏cursor在DB查询前拒绝',async()=>{await expect(listReasoningSources(user,event,'anything,or')).rejects.toThrow();expect(m.from).not.toHaveBeenCalled();});
