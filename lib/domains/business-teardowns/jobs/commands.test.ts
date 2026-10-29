import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc:vi.fn()}}));
import {supabaseAdmin} from '@/lib/supabase';
import {loadBusinessJobState} from './commands';
const owner='10000000-0000-4000-8000-000000000001';
describe('job state availability',()=>{
 it('reports only missing121 as unavailable',async()=>{vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({data:null,error:{code:'PGRST202',message:'Could not find business_job_command'}} as never);expect((await loadBusinessJobState(owner)).available).toBe(false);});
 it('does not disguise owner or transient RPC errors as missing schema',async()=>{vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({data:null,error:{code:'42501',message:'business_job_command owner denied'}} as never);await expect(loadBusinessJobState(owner)).rejects.toThrow('owner denied');});
});
