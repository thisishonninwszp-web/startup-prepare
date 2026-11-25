import {beforeEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({enabled:vi.fn(),user:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:h.enabled}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:h.user}})}));
vi.mock('@/lib/domains/business-teardowns/action-choices/transport',()=>({loadActionChoiceIdeas:h.load}));
import {loadActionChoiceIdeasAction} from './actions';
beforeEach(()=>{vi.clearAllMocks();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:{id:'authenticated-owner'}}});});
it('loads only the authenticated owner with a bounded page cursor',async()=>{await loadActionChoiceIdeasAction({before:'cursor'});expect(h.load).toHaveBeenCalledWith('authenticated-owner',{before:'cursor'});});
it('rejects disabled and signed out reads before transport',async()=>{h.enabled.mockReturnValue(false);await expect(loadActionChoiceIdeasAction()).rejects.toThrow();h.enabled.mockReturnValue(true);h.user.mockResolvedValue({data:{user:null}});await expect(loadActionChoiceIdeasAction()).rejects.toThrow();expect(h.load).not.toHaveBeenCalled();});
