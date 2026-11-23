import {beforeEach,it,expect,vi} from 'vitest';
const run=vi.hoisted(()=>vi.fn());vi.mock('@/lib/domains/business-teardowns/withdrawals/collection/cron',()=>({runWithdrawalCron:run}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','secret');});
it('requires existing cron secret before any owner/job work',async()=>{expect((await GET(new Request('https://example.com'))).status).toBe(401);expect(run).not.toHaveBeenCalled();});
it('reports collection disabled as200 while queue selection may still run',async()=>{run.mockResolvedValue({selection:null,collection:{status:'disabled'}});const result=await GET(new Request('https://example.com',{headers:{authorization:'Bearer secret'}}));expect(result.status).toBe(200);expect((await result.json()).collection.status).toBe('disabled');});
it('reports failures explicitly without retry',async()=>{run.mockRejectedValue(new Error('db'));expect((await GET(new Request('https://example.com',{headers:{authorization:'Bearer secret'}}))).status).toBe(503);expect(run).toHaveBeenCalledTimes(1);});
