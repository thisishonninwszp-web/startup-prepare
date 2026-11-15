import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),save:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:mocks.user}})}));
vi.mock('@/lib/domains/premises/commands',()=>({savePremise:mocks.save}));
vi.mock('@/lib/domains/premises/queries',()=>({readPremises:mocks.read}));
import {mutatePremiseAction,listPremisesAction} from './actions';
beforeEach(()=>vi.clearAllMocks());
it('blocks anonymous mutations before command dispatch',async()=>{mocks.user.mockResolvedValue({data:{user:null}});expect(await mutatePremiseAction({})).toMatchObject({ok:false});expect(mocks.save).not.toHaveBeenCalled();});
it('derives owner only from current authenticated session',async()=>{mocks.user.mockResolvedValue({data:{user:{id:'owner'}}});mocks.read.mockResolvedValue({available:true,items:[],nextCursor:null});await listPremisesAction();expect(mocks.read).toHaveBeenCalledWith('owner',{operation:'list'});});
