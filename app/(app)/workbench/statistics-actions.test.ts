import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),approve:vi.fn(),provider:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:mocks.auth}})}));
vi.mock('@/lib/domains/observations/statistics/commands',()=>({approveStatistics:mocks.approve,previewStatistics:mocks.provider,refreshStatistics:vi.fn(),deleteStatisticalSource:vi.fn(),linkStatisticsIdea:vi.fn()}));
vi.mock('@/lib/domains/observations/statistics/queries',()=>({loadStatistics:vi.fn(),loadStatisticalSnapshot:vi.fn()}));
vi.mock('@/lib/domains/observations/statistics/provider',()=>({fetchStatisticalMetadata:vi.fn()}));
import {approveStatisticsAction} from './statistics-actions';
describe('statistics action boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('STATISTICAL_DENOMINATORS_ENABLED','true');mocks.auth.mockResolvedValue({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});mocks.approve.mockResolvedValue({id:'saved'});});
 it('requires explicit confirmation and derives owner from auth',async()=>{const input={filters:{},metadataHash:'a'.repeat(64),previewHash:'b'.repeat(64),requestId:'22222222-2222-4222-8222-222222222222',confirmed:false};expect((await approveStatisticsAction(input)).ok).toBe(false);expect(mocks.approve).not.toHaveBeenCalled();expect((await approveStatisticsAction({...input,confirmed:true})).ok).toBe(true);expect(mocks.approve.mock.calls[0][0]).toBe('11111111-1111-4111-8111-111111111111');});
 it('default off and signed out cannot query provider or save',async()=>{vi.stubEnv('STATISTICAL_DENOMINATORS_ENABLED','false');expect((await approveStatisticsAction({} as never)).ok).toBe(false);expect(mocks.approve).not.toHaveBeenCalled();vi.stubEnv('STATISTICAL_DENOMINATORS_ENABLED','true');mocks.auth.mockResolvedValue({data:{user:null}});expect((await approveStatisticsAction({} as never)).ok).toBe(false);expect(mocks.approve).not.toHaveBeenCalled();});
});
