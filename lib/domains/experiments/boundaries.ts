import type { CaseOrigin, ExecutionContext, ExperimentObjective, TestOutcome, ExperimentData } from './domain';
export type ExperimentBoundary = {
    checked: string[];
    stillUnknown: string[];
    nextQuestions: string[];
    demandConclusion: 'unresolved';
};
export function summarizeExperimentBoundary(input: {
    objective: ExperimentObjective;
    caseOrigins: CaseOrigin[];
    executionContexts: ExecutionContext[];
    reportedOutcomes: TestOutcome[];
    hasAttributedFeedback: boolean;
}): ExperimentBoundary {
    const checked: string[] = [];
    if (input.reportedOutcomes.length) {
        if (input.caseOrigins.includes('synthetic'))
            checked.push('合成输入仅检查模拟流程，不代表真实用户');
        if (input.executionContexts.includes('ai_simulation'))
            checked.push('AI 模拟输出仅供流程核对');
        if (input.caseOrigins.includes('public'))
            checked.push('仅核对所选公开资料与输入');
        if (input.objective === 'premise') {
            const materialOnly = input.caseOrigins.length > 0 && !input.caseOrigins.includes('synthetic') && !input.executionContexts.includes('ai_simulation');
            if (input.reportedOutcomes.includes('fail'))
                checked.push(materialOnly ? '材料核对记录包含不通过项，请核对原文后判断是否构成反证' : '模拟/测试未通过，不能作为现实前提的反证');
            else
                checked.push(materialOnly && !input.reportedOutcomes.includes('unresolved') ? '前提尚未反驳，不代表已证实' : '前提仍未知，尚未形成可核对结论');
        }
        else
            checked.push(input.reportedOutcomes.every(o => o === 'pass') ? '所选输入下的测试通过' : '逐案结果包含不通过或未知');
        if (input.hasAttributedFeedback)
            checked.push('已记录用户提供的有归属反馈；请另到真实验证入口记录接触');
    }
    return { checked, stillUnknown: ['真实任务适用性、痛点和付费仍未知', '样本覆盖与持续需求仍未知'], nextQuestions: ['真实任务中是否出现相同问题？', '需要向真人核对哪些痛点、替代方案和付费行为？'], demandConclusion: 'unresolved' };
}
export function boundaryForRun(data: ExperimentData, runId: string): ExperimentBoundary {
    const run = data.runs.find(r => r.id === runId);
    const experiment = data.experiments.find(e => e.id === run?.experiment_id);
    if (!run || !experiment)
        throw new Error('找不到运行');
    const results = data.results.filter(r => r.run_id === runId);
    const complete = run.status !== 'running' && results.length === run.case_manifest.length && run.case_manifest.every(id => results.some(r => r.case_id === id));
    return summarizeExperimentBoundary({ objective: experiment.objective, caseOrigins: data.cases.filter(c => run.case_manifest.includes(c.id)).map(c => c.input_origin), executionContexts: complete ? results.map(r => r.execution_context) : [], reportedOutcomes: complete ? results.map(r => r.outcome) : [], hasAttributedFeedback: complete && results.some(r => r.execution_context === 'external_feedback' && !!r.notes.trim()) });
}
