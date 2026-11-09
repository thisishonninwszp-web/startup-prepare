import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('./owner',()=>({businessJobOwner:vi.fn()}));
vi.mock('./executor',()=>({executeBusinessJob:vi.fn()}));
import {businessJobOwner} from './owner';
import {executeBusinessJob} from './executor';
import {runBusinessJobs} from './cron';
describe('owner-only cron worker',()=>{
 beforeEach(()=>vi.resetAllMocks());
 it('executes only the configured main account',async()=>{vi.mocked(businessJobOwner).mockResolvedValue('main');vi.mocked(executeBusinessJob).mockResolvedValue({status:'materials_ready'});expect((await runBusinessJobs()).failed).toBe(0);expect(executeBusinessJob).toHaveBeenCalledExactlyOnceWith('main','cron');});
 it('does not enumerate users or execute without a configured owner',async()=>{vi.mocked(businessJobOwner).mockResolvedValue(null);await expect(runBusinessJobs()).rejects.toThrow('主账号');expect(executeBusinessJob).not.toHaveBeenCalled();});
 it('exposes owner execution failures',async()=>{vi.mocked(businessJobOwner).mockResolvedValue('main');vi.mocked(executeBusinessJob).mockRejectedValue(new Error('lease unavailable'));expect(await runBusinessJobs()).toEqual({failed:1,results:[{owner:'main',status:'error',message:'lease unavailable'}]});});
});
