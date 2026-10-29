export type ExperimentObjective = 'premise' | 'workflow' | 'delivery' | 'demand';
export type AccessContext = {
    publicSources: boolean;
    canRunPrototype: boolean;
    canPublishExample: boolean;
    canContactPeople: boolean;
};
export type ExperimentRoute = 'public_check' | 'task_reconstruction' | 'prototype_test' | 'opt_in_trial' | 'direct_contact' | 'deferred_contact';
export type CaseOrigin = 'public' | 'owned' | 'synthetic';
export type ExecutionContext = 'self_run' | 'ai_simulation' | 'external_feedback';
export type TestOutcome = 'pass' | 'fail' | 'unresolved';
export type SourceSnapshot = {
    source_type: string;
    source_id?: string | null;
    url?: string | null;
    publisher: string | null;
    published_at: string | null;
    captured_at: string;
    excerpt: string;
    hash: string;
    capture_scope: string;
    truncated: boolean;
    missing_text: boolean;
    authorized?: boolean;
};
export type ExperimentVersionInput = {
    ideaId: string;
    gapId?: string | null;
    seriesId?: string | null;
    requestId: string;
    objective: ExperimentObjective;
    route: ExperimentRoute;
    accessContext: AccessContext;
    question: string;
    inputPlan: {
        scope: string;
        role?: string;
        trigger?: string;
        inputs?: string;
        steps?: string;
        current_alternative?: string;
        obstacles?: string;
        refs?: string[];
        unknowns?: string;
    };
    steps: string[];
    passCriterion: string;
    failCriterion: string;
    limits: string;
    timeBudgetMinutes: number | null;
    costBudgetMinor: number | null;
    currency: string | null;
    deferredQuestions: string[];
    recheckOn: string | null;
};
export type ExperimentCaseInput = {
    experimentId: string;
    requestId: string;
    inputOrigin: CaseOrigin;
    inputText: string;
    sourceSnapshot: SourceSnapshot | null;
    expectedOutput: string;
};
export type ExperimentResultInput = {
    caseId: string;
    executionContext: ExecutionContext;
    outcome: TestOutcome;
    actualOutput: {
        text: string;
        artifact?: {
            url?: string;
            material_id?: string;
            description: string;
        } | null;
    };
    manualIntervention: string;
    notes: string;
};
export type StartRunInput = {
    experimentId: string;
    requestId: string;
    supersedesRunId?: string | null;
};
export type CompleteRunInput = {
    runId: string;
    requestId: string;
    status: 'completed' | 'failed' | 'cancelled';
    results: ExperimentResultInput[];
    actualMinutes: number | null;
    actualCostMinor: number | null;
    currency: string | null;
    outputArtifact: {
        url?: string;
        material_id?: string;
        description: string;
    } | null;
};
export type AttachExperimentInput = {
    gapId: string;
    runId: string;
    requestId: string;
    note: string;
};
export type ExperimentVersion = {
    id: string;
    user_id: string;
    idea_id: string;
    gap_id: string | null;
    series_id: string;
    revision: number;
    objective: ExperimentObjective;
    route: ExperimentRoute;
    access_context: AccessContext;
    question: string;
    hypothesis_snapshot: unknown;
    gap_snapshot: unknown;
    input_plan: ExperimentVersionInput['inputPlan'];
    steps: string[];
    pass_criterion: string;
    fail_criterion: string;
    limits: string;
    time_budget_minutes: number | null;
    cost_budget_minor: number | null;
    currency: string | null;
    deferred_questions: string[];
    recheck_on: string | null;
    created_at: string;
};
export type ExperimentCase = {
    id: string;
    experiment_id: string;
    input_origin: CaseOrigin;
    input_text: string;
    source_snapshot: SourceSnapshot | null;
    expected_output: string;
    created_at: string;
};
export type ExperimentRun = {
    id: string;
    experiment_id: string;
    case_manifest: string[];
    criteria_snapshot?: { pass: string; fail: string; limits: string };
    supersedes_run_id?: string | null;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    started_at: string;
    finished_at: string | null;
    actual_minutes: number | null;
    actual_cost_minor: number | null;
    currency: string | null;
    output_artifact: CompleteRunInput['outputArtifact'];
};
export type ExperimentResult = {
    id: string;
    run_id: string;
    case_id: string;
    execution_context: ExecutionContext;
    outcome: TestOutcome;
    actual_output: ExperimentResultInput['actualOutput'];
    manual_intervention: string;
    notes: string;
};
export type ExperimentData = {
    experiments: ExperimentVersion[];
    cases: ExperimentCase[];
    runs: ExperimentRun[];
    results: ExperimentResult[];
    hasMore: boolean;
    boundaries?: Record<string, import("./boundaries").ExperimentBoundary>;
};
export function availableRoutes(a: AccessContext): ExperimentRoute[] {
  const routes: ExperimentRoute[] = [];
  if (a.publicSources) routes.push('public_check', 'task_reconstruction');
  if (a.canRunPrototype) routes.push('prototype_test');
  if (a.canPublishExample) routes.push('opt_in_trial');
  routes.push(a.canContactPeople ? 'direct_contact' : 'deferred_contact');
  return routes;
}
export function text(value: unknown, max = 10000, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('文本缺失或超出长度限制');
  return value.trim();
}
export function uuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('无效标识');
}
export function budget(minutes: number | null, cost: number | null, currency: string | null) {
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) throw new Error('时间预算无效');
  if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0 || !currency || !/^[A-Z]{3}$/.test(currency))) throw new Error('费用及币种无效');
  if (cost === null && currency !== null) throw new Error('未设费用时币种须为空');
}
export function validateVersion(v: ExperimentVersionInput) {
  uuid(v.ideaId); uuid(v.requestId);
  if (v.gapId) uuid(v.gapId);
  if (v.seriesId) uuid(v.seriesId);
  if (!['premise', 'workflow', 'delivery', 'demand'].includes(v.objective)) throw new Error('无效目标');
  const access = v.accessContext;
  if (!access || ['publicSources', 'canRunPrototype', 'canPublishExample', 'canContactPeople'].some(k => typeof access[k as keyof AccessContext] !== 'boolean') || !availableRoutes(access).includes(v.route)) throw new Error('路线与资源不符');
  text(v.question, 2000, true); text(v.passCriterion, 3000, true); text(v.failCriterion, 3000, true);
  text(v.limits, 3000, true); text(v.inputPlan?.scope, 5000, true);
  if (!Array.isArray(v.steps) || !v.steps.length || v.steps.length > 30) throw new Error('需要具体步骤');
  v.steps.forEach(step => text(step, 2000, true));
  if (!Array.isArray(v.deferredQuestions) || v.deferredQuestions.length > 30) throw new Error('待接触问题无效');
  v.deferredQuestions.forEach(question => text(question, 2000, true));
  budget(v.timeBudgetMinutes, v.costBudgetMinor, v.currency);
  if (v.recheckOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(v.recheckOn) || !Number.isFinite(Date.parse(v.recheckOn)) || new Date(v.recheckOn).toISOString().slice(0, 10) !== v.recheckOn)) throw new Error('复查日期无效');
  if (v.route === 'task_reconstruction') {
    for (const field of ['role', 'trigger', 'inputs', 'steps', 'current_alternative', 'obstacles', 'unknowns'] as const) text(v.inputPlan[field], 5000, true);
    if (!Array.isArray(v.inputPlan.refs)) throw new Error('任务重建须记录引用（尚无引用时明确留空）');
    v.inputPlan.refs.forEach(ref => text(ref, 2000, true));
  }
}
export function validateCase(v: ExperimentCaseInput) {
  uuid(v.experimentId); uuid(v.requestId);
  if (!['public', 'owned', 'synthetic'].includes(v.inputOrigin)) throw new Error('无效样本来源');
  text(v.inputText, 30000, true); text(v.expectedOutput, 10000, true);
  const source = v.sourceSnapshot;
  if (v.inputOrigin === 'synthetic') {
    if (source) throw new Error('合成输入不能伪造来源');
    return;
  }
  if (!source || !source.source_type || !source.captured_at || !source.hash || !source.capture_scope || typeof source.truncated !== 'boolean' || typeof source.missing_text !== 'boolean') throw new Error('需要完整来源快照');
  if (v.inputOrigin === 'public' && ((!source.url && !source.source_id) || !source.publisher || !source.excerpt || source.missing_text)) throw new Error('公开样本需要出处和实际摘录');
  if (v.inputOrigin === 'public' && v.inputText !== source.excerpt) throw new Error('公开输入必须等于来源摘录');
  if (v.inputOrigin === 'owned' && !source.authorized) throw new Error('自有材料须确认授权');
  text(source.excerpt, 30000);
}

