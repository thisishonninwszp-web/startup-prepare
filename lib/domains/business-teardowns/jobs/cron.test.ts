import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{from:vi.fn()}}));
vi.mock('./executor',()=>({executeBusinessJob:vi.fn()}));
import {supabaseAdmin} from '@/lib/supabase';
import {executeBusinessJob} from './executor';
import {runBusinessJobs} from './cron';
describe('independent cron workers',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('keeps owner failures explicit while continuing independent owners',async()=>{const chain={select:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range:vi.fn().mockResolvedValue({data:[{user_id:'a'},{user_id:'b'}],error:null})};vi.mocked(supabaseAdmin.from).mockReturnValue(chain as never);vi.mocked(executeBusinessJob).mockRejectedValueOnce(new Error('lease unavailable')).mockResolvedValueOnce({status:'materials_ready'});const result=await runBusinessJobs();expect(result.failed).toBe(1);expect(result.results).toEqual([{owner:'a',status:'error',message:'lease unavailable'},{owner:'b',status:'materials_ready'}]);});
});
