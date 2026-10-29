import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('@/lib/domains/business-teardowns/jobs/commands',()=>({businessJobsEnabled:vi.fn(()=>true)}));
vi.mock('@/lib/domains/business-teardowns/jobs/cron',()=>({runBusinessJobs:vi.fn(async()=>({failed:0,results:[]}))}));
import {GET} from './route';
import {runBusinessJobs} from '@/lib/domains/business-teardowns/jobs/cron';
import {businessJobsEnabled} from '@/lib/domains/business-teardowns/jobs/commands';
describe('business cron endpoint',()=>{
 afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
 it('requires configured exact bearer secret before work',async()=>{vi.stubEnv('CRON_SECRET','secret');expect((await GET(new Request('http://localhost',{headers:{authorization:'Bearer wrong'}}))).status).toBe(401);expect(runBusinessJobs).not.toHaveBeenCalled();});
 it('fails closed when disabled',async()=>{vi.stubEnv('CRON_SECRET','secret');vi.mocked(businessJobsEnabled).mockReturnValueOnce(false);expect((await GET(new Request('http://localhost',{headers:{authorization:'Bearer secret'}}))).status).toBe(503);});
 it('returns explicit independent worker failures',async()=>{vi.stubEnv('CRON_SECRET','secret');vi.mocked(runBusinessJobs).mockResolvedValueOnce({failed:1,results:[{owner:'a',status:'error',message:'source unavailable'}]});expect((await GET(new Request('http://localhost',{headers:{authorization:'Bearer secret'}}))).status).toBe(502);});
});
