import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),list:vi.fn(),get:vi.fn(),source:vi.fn(),save:vi.fn(),sources:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:h.enabled}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:h.user}})}));
vi.mock('@/lib/domains/business-teardowns/result-methods/transport',()=>({listResultMethods:h.list,getResultMethod:h.get,getResultMethodSource:h.source,resultMethodCommand:h.save}));
vi.mock('@/lib/domains/business-teardowns/reality-results/transport',()=>({listRealityResults:h.sources}));
import {resultMethodsListAction,resultMethodGetAction,resultMethodSourceAction,resultMethodSaveAction,resultMethodSourcesAction} from './actions';
describe('method authenticated actions',()=>{
 beforeEach(()=>{vi.clearAllMocks();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:{id:'owner'}}});});
 it('gates every action before transport reads or writes',async()=>{
  const calls=[()=>resultMethodsListAction(),()=>resultMethodGetAction('id'),()=>resultMethodSourceAction('source'),()=>resultMethodSourcesAction(),()=>resultMethodSaveAction({operation:'erase',id:'id',requestId:'request',expectedRevision:1})];
  h.enabled.mockReturnValue(false);for(const call of calls)await expect(call()).rejects.toThrow('尚未开启');
  h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:null}});for(const call of calls)await expect(call()).rejects.toThrow('请先登录');
  for(const fn of [h.list,h.get,h.source,h.save,h.sources])expect(fn).not.toHaveBeenCalled();
 });
 it('uses only the authenticated owner and preserves exact input',async()=>{
  await resultMethodsListAction({caseId:'case',resultId:'result',before:'cursor'});await resultMethodGetAction('id');await resultMethodSourceAction('result');await resultMethodSourcesAction({caseId:'case',before:'older'});await resultMethodSaveAction({operation:'erase',id:'id',requestId:'request',expectedRevision:1});
  expect(h.list).toHaveBeenCalledWith('owner',{caseId:'case',resultId:'result',before:'cursor'});expect(h.get).toHaveBeenCalledWith('owner','id');expect(h.source).toHaveBeenCalledWith('owner','result');expect(h.sources).toHaveBeenCalledWith('owner',{caseId:'case',before:'older'});expect(h.save).toHaveBeenCalledWith('owner',{operation:'erase',id:'id',requestId:'request',expectedRevision:1});
 });
});
