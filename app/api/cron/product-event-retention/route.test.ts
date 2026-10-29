import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({purge:vi.fn()}));
vi.mock('@/lib/domains/observations/product-events/commands',()=>({purgeExpiredProductEvents:m.purge}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','fixture-secret');vi.stubEnv('PRODUCT_EVENTS_ENABLED','true');m.purge.mockResolvedValue({erased:3});});
it('未鉴权不会清理',async()=>{const r=await GET(new Request('https://example.test/api/cron/product-event-retention'));expect(r.status).toBe(401);expect(m.purge).not.toHaveBeenCalled();});
it('默认关闭时不读写事件',async()=>{vi.stubEnv('PRODUCT_EVENTS_ENABLED','false');const r=await GET(new Request('https://example.test',{headers:{authorization:'Bearer fixture-secret'}}));expect(await r.json()).toEqual({enabled:false,erased:0});expect(m.purge).not.toHaveBeenCalled();});
it('鉴权和开关通过后只返回清理汇总',async()=>{const r=await GET(new Request('https://example.test',{headers:{authorization:'Bearer fixture-secret'}}));expect(await r.json()).toEqual({enabled:true,erased:3});expect(m.purge).toHaveBeenCalledWith(500);});
it('清理失败不泄露数据库或个人内容',async()=>{m.purge.mockRejectedValue(new Error('private source payload'));const r=await GET(new Request('https://example.test',{headers:{authorization:'Bearer fixture-secret'}}));expect(r.status).toBe(500);expect(JSON.stringify(await r.json())).not.toContain('private');});
