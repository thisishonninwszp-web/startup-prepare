import { supabaseAdmin } from '@/lib/supabase';
import { uuid, type ExperimentData, type ExperimentVersion, type ExperimentCase, type ExperimentRun, type ExperimentResult } from './domain';
import { boundaryForRun } from './boundaries';
export function missingExperimentSchema(error: {
    code?: string;
    message: string;
}): boolean { return ['42P01', 'PGRST205', 'PGRST202'].includes(error.code ?? '') && /idea_experiment|save_idea_experiment|append_idea_experiment|start_idea_experiment|complete_idea_experiment|attach_experiment_gap_ref/.test(error.message); }
/** Page parent versions; read every child page so a frozen manifest is never silently truncated. */
export async function loadExperiments(viewerId: string, ideaId: string, offset = 0): Promise<ExperimentData | 'missing-schema'> {
    uuid(viewerId);
    uuid(ideaId);
    if (!Number.isSafeInteger(offset) || offset < 0)
        throw new Error('分页无效');
    const own = await supabaseAdmin.from('ideas').select('id').eq('id', ideaId).eq('user_id', viewerId).maybeSingle();
    if (own.error)
        throw new Error(own.error.message);
    if (!own.data)
        throw new Error('找不到这个想法');
    const v = await supabaseAdmin.from('idea_experiments').select('*').eq('user_id', viewerId).eq('idea_id', ideaId).order('created_at', { ascending: false }).order('id').range(offset, offset + 19);
    if (v.error) {
        if (missingExperimentSchema(v.error))
            return 'missing-schema';
        throw new Error(v.error.message);
    }
    const experiments = (v.data ?? []) as ExperimentVersion[];
    if (!experiments.length)
        return { experiments, cases: [], runs: [], results: [], hasMore: false, boundaries: {} };
    const ids = experiments.map(e => e.id);
    async function readAll(table: string, foreignKey: string, values: string[], order: string) { const rows: unknown[] = []; for (let start = 0;; start += 500) {
        const q = await supabaseAdmin.from(table).select('*').eq('user_id', viewerId).eq('idea_id', ideaId).in(foreignKey, values).order(order).order('id').range(start, start + 499);
        if (q.error)
            throw q.error;
        rows.push(...(q.data ?? []));
        if ((q.data?.length ?? 0) < 500)
            return rows;
    } }
    try {
        const [c, r] = await Promise.all([readAll('idea_experiment_cases', 'experiment_id', ids, 'created_at'), readAll('idea_experiment_runs', 'experiment_id', ids, 'started_at')]);
        const runs = r as ExperimentRun[];
        const results: ExperimentResult[] = [];
        for (let start = 0; start < runs.length; start += 100) {
            results.push(...await readAll('idea_experiment_results', 'run_id', runs.slice(start, start + 100).map(x => x.id), 'created_at') as ExperimentResult[]);
        }
        const data: ExperimentData = { experiments, cases: c as ExperimentCase[], runs, results, hasMore: experiments.length === 20, boundaries: {} };
        for (const run of runs)
            data.boundaries![run.id] = boundaryForRun(data, run.id);
        return data;
    }
    catch (error) {
        const e = error as {
            code?: string;
            message: string;
        };
        if (missingExperimentSchema(e))
            return 'missing-schema';
        throw new Error(e.message);
    }
}
export async function listExperimentSummaries(viewerId: string, ideaId: string) { return loadExperiments(viewerId, ideaId); }
