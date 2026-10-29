import { vi, expect, it, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: state }));
vi.mock('@/lib/ai', () => ({ planInfoGaps: vi.fn() }));
vi.mock('./touch', () => ({ touchIdea: vi.fn() }));
import { addGapEvidence } from './info-gaps';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('enabled path appends through a single atomic RPC', async () => { vi.stubEnv('IDEA_EXPERIMENTS_ENABLED', 'true'); state.rpc.mockResolvedValue({ error: null }); await addGapEvidence('u', 'g', { title: 'quote' }); expect(state.rpc).toHaveBeenCalledWith('append_idea_gap_evidence', expect.objectContaining({ p_user_id: 'u', p_gap_id: 'g', p_item: { title: 'quote' }, p_request_id: expect.any(String) })); expect(state.from).not.toHaveBeenCalled(); });
it('enabled missing schema does not silently fall back', async () => { vi.stubEnv('IDEA_EXPERIMENTS_ENABLED', 'true'); state.rpc.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } }); await expect(addGapEvidence('u', 'g', { title: 'quote' })).rejects.toThrow('permission denied'); expect(state.from).not.toHaveBeenCalled(); });
it('disabled path keeps existing append behavior without migration109', async () => { vi.stubEnv('IDEA_EXPERIMENTS_ENABLED', 'false'); const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() }; chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.update.mockReturnValue(chain); chain.maybeSingle.mockResolvedValue({ data: { evidence: [{ title: 'old' }] }, error: null }); state.from.mockReturnValue(chain); await addGapEvidence('u', 'g', { title: 'quote' }); expect(state.rpc).not.toHaveBeenCalled(); expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ evidence: [{ title: 'old' }, expect.objectContaining({ title: 'quote' })] })); });
it('generic append cannot forge experiment references', async () => { await expect(addGapEvidence('u', 'g', { title: 'fake', experiment_run_id: 'r' })).rejects.toThrow('专用'); });
it('enabled missing109 keeps only the plain legacy note path working',async()=>{vi.stubEnv('IDEA_EXPERIMENTS_ENABLED','true');state.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Could not find function append_idea_gap_evidence'}});const chain={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),update:vi.fn()};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);chain.update.mockReturnValue(chain);chain.maybeSingle.mockResolvedValue({data:{evidence:[]},error:null});state.from.mockReturnValue(chain);await addGapEvidence('u','g',{title:'plain legacy note'});expect(chain.update).toHaveBeenCalled();});


it('marking a derived-only gap got never refreshes idea activity',async()=>{
 const {setGapStatus}=await import('./info-gaps');const {touchIdea}=await import('./touch');
 const q={update:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn()};q.update.mockReturnValue(q);q.eq.mockReturnValue(q);q.select.mockReturnValue(q);q.maybeSingle.mockResolvedValue({data:{idea_id:'idea',evidence:[{experiment_run_id:'run'}]},error:null});state.from.mockReturnValue(q);
 await setGapStatus('u','g','got','');expect(touchIdea).not.toHaveBeenCalled();
 q.maybeSingle.mockResolvedValue({data:{idea_id:'idea',evidence:[{title:'legacy'}]},error:null});await setGapStatus('u','g','got','');expect(touchIdea).toHaveBeenCalledWith('u','idea');
});
