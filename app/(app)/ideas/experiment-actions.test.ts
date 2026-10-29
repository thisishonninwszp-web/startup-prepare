import { vi, expect, it, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'owner' } as {
        id: string;
    } | null, save: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/domains/experiments/commands', () => ({ saveExperimentVersion: state.save }));
vi.mock('@/lib/domains/experiments/queries', () => ({ loadExperiments: state.load }));
import { saveExperimentVersionAction, loadExperimentsAction } from './experiment-actions';
afterEach(() => { state.user = { id: 'owner' }; vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('rejects unauthenticated writes', async () => { state.user = null; expect(await saveExperimentVersionAction({} as never)).toEqual({ ok: false, message: '未登录' }); expect(state.save).not.toHaveBeenCalled(); });
it('rejects disabled writes and returns disabled read', async () => { vi.stubEnv('IDEA_EXPERIMENTS_ENABLED', 'false'); expect((await saveExperimentVersionAction({} as never)).ok).toBe(false); expect(await loadExperimentsAction('idea')).toEqual({ ok: true, data: 'disabled' }); expect(state.save).not.toHaveBeenCalled(); });
it('derives owner only from session', async () => { vi.stubEnv('IDEA_EXPERIMENTS_ENABLED', 'true'); state.save.mockResolvedValue({ id: 'saved' }); const input = { userId: 'attacker' } as never; expect(await saveExperimentVersionAction(input)).toEqual({ ok: true, id: 'saved' }); expect(state.save).toHaveBeenCalledWith('owner', input); });
it('returns actionable database error for input-preserving retry', async () => { vi.stubEnv('IDEA_EXPERIMENTS_ENABLED', 'true'); state.save.mockRejectedValue(new Error('transaction failed')); expect(await saveExperimentVersionAction({} as never)).toEqual({ ok: false, message: 'transaction failed' }); });
