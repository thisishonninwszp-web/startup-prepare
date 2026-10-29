import {vi,it,expect,beforeEach} from 'vitest';
const run=vi.hoisted(()=>vi.fn());vi.mock('@/lib/domains/observations/scheduling/run',()=>({runScheduledObservations:run}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='private';process.env.SCHEDULED_OBSERVATIONS_ENABLED='true';process.env.STATISTICAL_DENOMINATORS_ENABLED='true';});
const request=(secret='private')=>new Request('https://example.test/api/cron/observations',{headers:{authorization:`Bearer ${secret}`}});
it('rejects missing/wrong cron secret before any claim',async()=>{expect((await GET(request('wrong'))).status).toBe(401);expect(run).not.toHaveBeenCalled();});
it('does not start when either opt-in switch is disabled',async()=>{process.env.STATISTICAL_DENOMINATORS_ENABLED='false';expect((await GET(request())).status).toBe(503);expect(run).not.toHaveBeenCalled();});
it('reports failed work visibly instead of a healthy empty run',async()=>{run.mockResolvedValue({completed:0,failed:1,discarded:0,runs:[{status:'failed',error:'provider_request_failed'}]});expect((await GET(request())).status).toBe(502);});
