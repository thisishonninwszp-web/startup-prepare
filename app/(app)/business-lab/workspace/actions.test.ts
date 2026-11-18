import {beforeEach,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:true,user:{id:'owner'} as {id:string}|null,read:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:()=>h.enabled}));vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:h.user}})}})}));vi.mock('@/lib/domains/business-teardowns/workspace/transport',()=>({loadCaseWorkspace:h.read}));
import {loadCaseWorkspaceAction} from './actions';
beforeEach(()=>{h.enabled=true;h.user={id:'owner'};h.read.mockReset();});
it('derives owner from login before reading the exact bounded page',async()=>{h.read.mockResolvedValue('page');expect(await loadCaseWorkspaceAction({caseId:'case',before:'cursor'})).toBe('page');expect(h.read).toHaveBeenCalledWith('owner',{caseId:'case',before:'cursor'});});
it('does not read when feature is disabled or session missing',async()=>{h.enabled=false;await expect(loadCaseWorkspaceAction({caseId:'case'})).rejects.toThrow();h.enabled=true;h.user=null;await expect(loadCaseWorkspaceAction({caseId:'case'})).rejects.toThrow();expect(h.read).not.toHaveBeenCalled();});
