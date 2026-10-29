import { describe, expect, it } from 'vitest';
import { normalizeConfig, normalizeRun, isMissingObservationSchema } from './domain';
const config = { question: '哪项任务有阻碍？', decisionToChange: '是否做原型', sources: ['public'], region: 'JP', language: 'ja', fixedPhrases: ['入住'], exploratoryPhrases: [], seeds: [], filters: {}, stopCondition: '找到可核对原文', timeRange: '2026' };
describe('observation contracts', () => {
  it('keeps manual tasks and resource snapshots without invented budgets', () => {
    expect(normalizeConfig(config).mode).toBe('manual');
    expect(normalizeConfig(config).resources).toBeNull();
    expect(() => normalizeConfig({ ...config, mode: 'automatic' })).toThrow();
  });
  it('keeps actual zero distinct from missing and failure', () => {
    const run = normalizeRun({ status: 'success', records: [{ title: 'zero', text: '原文', origin: 'manual', value: 0 }, { title: 'unknown', text: '未知', origin: 'synthetic' }] });
    expect(run.records[0].value).toBe(0);
    expect(run.records[1].value).toBeNull();
    expect(() => normalizeRun({ status: 'failed', records: [], resultState: 'zero' })).toThrow();
    expect(() => normalizeRun({ status: 'success', records: [{ title: 'x', text: '', origin: 'public' }] })).toThrow();
  });
  it('only treats this domain missing objects as unavailable', () => {
    expect(isMissingObservationSchema({ code: '42P01', message: 'relation decision_observation_tasks does not exist' })).toBe(true);
    expect(isMissingObservationSchema({ code: '42501', message: 'permission denied decision_observation_tasks' })).toBe(false);
    expect(isMissingObservationSchema({ code: '42P01', message: 'relation ideas does not exist' })).toBe(false);
  });
});
