import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),list:vi.fn(),get:vi.fn(),source:vi.fn(),save:vi.fn(),sources:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:h.enabled}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:h.user}})}));
vi.mock('@/lib/domains/business-teardowns/followup-checks/transport',()=>({listFollowupChecks:h.list,getFollowupCheck:h.get,getFollowupCheckSource:h.source,followupCheckCommand:h.save}));
vi.mock('@/lib/domains/business-teardowns/reality-results/transport',()=>({listRealityResults:h.sources}));
import {followupChecksListAction,followupCheckGetAction,followupCheckSourceAction,followupCheckSaveAction,followupCheckSourcesAction} from './actions';
describe('follow-up authenticated actions',()=>{
 beforeEach(()=>{vi.clearAllMocks();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:{id:'owner'}}});});
 it('gates every action before transport reads or writes',async()=>{
  const calls=[()=>followupChecksListAction(),()=>followupCheckGetAction('id'),()=>followupCheckSourceAction('source'),()=>followupCheckSourcesAction(),()=>followupCheckSaveAction({operation:'erase',id:'id',requestId:'request',expectedRevision:1})];
  h.enabled.mockReturnValue(false);for(const call of calls)await expect(call()).rejects.toThrow('尚未开启');
  h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:null}});for(const call of calls)await expect(call()).rejects.toThrow('请先登录');
  for(const fn of [h.list,h.get,h.source,h.save,h.sources])expect(fn).not.toHaveBeenCalled();
 });
 it('uses only the authenticated owner and preserves exact input',async()=>{
  await followupChecksListAction({caseId:'case',resultId:'result',before:'cursor'});await followupCheckGetAction('id');await followupCheckSourceAction('result');await followupCheckSourcesAction({caseId:'case',before:'older'});await followupCheckSaveAction({operation:'erase',id:'id',requestId:'request',expectedRevision:2});
  expect(h.list).toHaveBeenCalledWith('owner',{caseId:'case',resultId:'result',before:'cursor'});expect(h.get).toHaveBeenCalledWith('owner','id');expect(h.source).toHaveBeenCalledWith('owner','result');expect(h.sources).toHaveBeenCalledWith('owner',{caseId:'case',before:'older'});expect(h.save).toHaveBeenCalledWith('owner',{operation:'erase',id:'id',requestId:'request',expectedRevision:2});
 });
});
