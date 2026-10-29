import { vi, expect, it } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc } }));
import { startExperimentRun } from './commands';
it('uses only owner bound atomic RPC', async () => { rpc.mockResolvedValue({ data: { id: 'saved' }, error: null }); expect(await startExperimentRun('00000000-0000-0000-0000-000000000001', { experimentId: '00000000-0000-0000-0000-000000000002', requestId: '00000000-0000-0000-0000-000000000003' })).toEqual({ id: 'saved' }); expect(rpc).toHaveBeenCalledWith('start_idea_experiment_run', expect.objectContaining({ p_user_id: '00000000-0000-0000-0000-000000000001' })); });
it('propagates database failures', async () => { rpc.mockResolvedValue({ data: null, error: { message: 'request mismatch' } }); await expect(startExperimentRun('00000000-0000-0000-0000-000000000001', { experimentId: '00000000-0000-0000-0000-000000000002', requestId: '00000000-0000-0000-0000-000000000003' })).rejects.toThrow('request mismatch'); });
