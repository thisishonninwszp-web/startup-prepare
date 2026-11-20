import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),list:vi.fn(),get:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND');}}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:h.enabled}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:h.user}})}));
vi.mock('@/lib/domains/business-teardowns/history/transport',()=>({listConfirmationHistory:h.list,getConfirmationNode:h.get}));
import Page,{dynamic} from './page';
import {owner,caseId,planId,resultId,planNode,resultNode} from './test-fixtures';
function panel(element:Awaited<ReturnType<typeof Page>>){return element.props.children.props.children[1];}
describe('exact confirmation history route',()=>{
 beforeEach(()=>{vi.clearAllMocks();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:{id:owner}}});h.list.mockResolvedValue({available:true,items:[],nextCursor:null});h.get.mockResolvedValue(planNode);});
 it('is dynamic and rejects disabled or anonymous users before reads',async()=>{expect(dynamic).toBe('force-dynamic');h.enabled.mockReturnValue(false);await expect(Page({searchParams:{}})).rejects.toThrow('NOT_FOUND');h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:null}});await expect(Page({searchParams:{}})).rejects.toThrow('NOT_FOUND');expect(h.list).not.toHaveBeenCalled();});
 it('rejects unknown, repeated, incomplete and malformed queries before reads',async()=>{for(const searchParams of [{before:'forged'},{caseId:[caseId]},{nodeId:planId},{nodeKind:'plan',nodeId:planId},{nodeKind:'result',nodeId:resultId,nodeRevision:'1'},{nodeKind:'plan',nodeId:planId,nodeRevision:'0'},{nodeKind:'plan',nodeId:planId,nodeRevision:'01'},{nodeKind:'plan',nodeId:planId,nodeRevision:'2147483648'},{nodeKind:'simulation',nodeId:planId},{nodeKind:['result'],nodeId:resultId}]){await expect(Page({searchParams})).rejects.toThrow('NOT_FOUND');expect(h.list).not.toHaveBeenCalled();}});
 it('loads an exact plan version beyond page one separately without fallback',async()=>{const p=panel(await Page({searchParams:{caseId,nodeKind:'plan',nodeId:planId,nodeRevision:'2'}}));expect(h.list).toHaveBeenCalledWith(owner,{caseId});expect(h.get).toHaveBeenCalledWith(owner,{kind:'plan',id:planId,revision:2});expect(p.props.initialNode).toEqual(planNode);expect(p.props.caseId).toBe(caseId);h.get.mockResolvedValue(null);await expect(Page({searchParams:{nodeKind:'plan',nodeId:planId,nodeRevision:'2'}})).rejects.toThrow('NOT_FOUND');});
 it('rejects exact kind/id/revision/case mismatches and forbids result revision',async()=>{for(const patch of [{id:resultId},{kind:'result'},{revision:3},{caseId:resultId}]){h.get.mockResolvedValue({...planNode,...patch});await expect(Page({searchParams:{caseId,nodeKind:'plan',nodeId:planId,nodeRevision:'2'}})).rejects.toThrow('NOT_FOUND');}h.get.mockResolvedValue(resultNode);expect(panel(await Page({searchParams:{nodeKind:'result',nodeId:resultId}})).props.initialNode).toEqual(resultNode);});
 it('isolates missing143 without exact dependent reads',async()=>{h.list.mockResolvedValue({available:false,items:[],nextCursor:null});const p=panel(await Page({searchParams:{nodeKind:'plan',nodeId:planId,nodeRevision:'2'}}));expect(p.props.initialState.available).toBe(false);expect(h.get).not.toHaveBeenCalled();});
});
