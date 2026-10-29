import { supabaseAdmin } from '@/lib/supabase';
import { budget, text, uuid, validateVersion, validateCase, type ExperimentVersionInput, type ExperimentCaseInput, type StartRunInput, type CompleteRunInput, type AttachExperimentInput } from './domain';
async function call(viewer: string, name: string, payload: object): Promise<{ id: string }> {
  uuid(viewer);
  const { data, error } = await supabaseAdmin.rpc(name, { p_user_id: viewer, p_input: payload });
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('保存未返回记录');
  return { id: data.id as string };
}
export function saveExperimentVersion(viewer: string, input: ExperimentVersionInput) {
  validateVersion(input);
  return call(viewer, 'save_idea_experiment_version', input);
}
export function appendExperimentCase(viewer: string, input: ExperimentCaseInput) {
  validateCase(input);
  return call(viewer, 'append_idea_experiment_case', input);
}
export function startExperimentRun(viewer: string, input: StartRunInput) {
  uuid(input.experimentId); uuid(input.requestId);
  if (input.supersedesRunId) uuid(input.supersedesRunId);
  return call(viewer, 'start_idea_experiment_run', input);
}
export function completeExperimentRun(viewer: string, input: CompleteRunInput) {
  uuid(input.runId); uuid(input.requestId);
  if (!['completed', 'failed', 'cancelled'].includes(input.status)) throw new Error('无效运行状态');
  budget(input.actualMinutes, input.actualCostMinor, input.currency);
  if (!Array.isArray(input.results) || input.results.length > 200) throw new Error('结果清单无效');
  for (const result of input.results) {
    uuid(result.caseId);
    if (!['self_run', 'ai_simulation', 'external_feedback'].includes(result.executionContext) || !['pass', 'fail', 'unresolved'].includes(result.outcome)) throw new Error('无效执行结果');
    text(result.actualOutput?.text, 30000, true);
    text(result.manualIntervention, 10000); text(result.notes, 10000, result.executionContext === 'external_feedback');
  }
  return call(viewer, 'complete_idea_experiment_run', input);
}
export function attachExperimentGapRef(viewer: string, input: AttachExperimentInput) {
  uuid(input.runId); uuid(input.gapId); uuid(input.requestId); text(input.note, 3000);
  return call(viewer, 'attach_experiment_gap_ref', input);
}
