import {beforeEach,it,expect,vi} from 'vitest';
const {owner,select,execute}=vi.hoisted(()=>({owner:vi.fn(),select:vi.fn(),execute:vi.fn()}));vi.mock('../../jobs/owner',()=>({businessJobOwner:owner}));vi.mock('../transport',()=>({withdrawalCommand:select}));vi.mock('./executor',()=>({executeWithdrawalCollection:execute}));
import {runWithdrawalCron} from './cron';
beforeEach(()=>{vi.clearAllMocks();owner.mockResolvedValue('main');select.mockResolvedValue({id:null,caseId:null,revision:null});execute.mockResolvedValue({status:'disabled'});});
it('selects only confirmed queue using main owner even with collection disabled',async()=>{expect((await runWithdrawalCron()).collection.status).toBe('disabled');expect(select).toHaveBeenCalledWith('main',expect.objectContaining({operation:'select_today'}));expect(execute).toHaveBeenCalledWith('main');});
it('never enumerates general users or charges an unconfigured owner',async()=>{owner.mockResolvedValue(null);expect((await runWithdrawalCron()).collection.status).toBe('owner_only');expect(select).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();});
it('soft disables absent collection migration, and keeps queue selection independent',async()=>{execute.mockResolvedValue({status:'schema_required'});expect((await runWithdrawalCron()).collection.status).toBe('schema_required');expect(select).toHaveBeenCalledTimes(1);});
