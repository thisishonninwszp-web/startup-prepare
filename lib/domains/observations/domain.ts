import { z } from 'zod';

const short = z.string().trim().max(2000);
const required = short.min(1);
const phrases = z.array(required).max(100).default([]);
export const uuid = z.string().uuid();
export const configSchema = z.object({
  question: required, decisionToChange: required, sources: phrases,
  region: short.default(''), language: short.default(''), timeRange: short.default(''),
  fixedPhrases: phrases, exploratoryPhrases: phrases,
  seeds: z.array(z.object({ text: required, origin: z.enum(['user','source','ai']), sourceUrl: z.string().url().nullable().optional() })).max(100).default([]),
  filters: z.record(z.string(), z.unknown()).default({}), stopCondition: required,
  mode: z.literal('manual').default('manual'), resources: z.record(z.string(), z.boolean()).nullable().default(null),
}).strict();
export type TaskConfig = z.infer<typeof configSchema>;
const httpUrl = z.string().max(2000).url().refine(v => /^https?:\/\//i.test(v), '只接受 HTTP/HTTPS 来源');
export const recordSchema = z.object({
  title: required, text: z.string().trim().min(1).max(30000), origin: z.enum(['manual','public','synthetic','ai_seed']),
  sourceUrl: httpUrl.nullable().default(null), publishedAt: z.string().datetime({ offset: true }).nullable().default(null),
  metric: short.nullable().default(null), value: z.number().finite().nullable().default(null), unit: short.nullable().default(null),
  time: short.nullable().default(null), region: short.nullable().default(null),
  providerMetadata: z.record(z.string(), z.unknown()).default({}),
  data: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((r, ctx) => { if (r.origin === 'public' && !r.sourceUrl) ctx.addIssue({code:'custom',message:'公开摘录须提供来源 URL'}); });
export type ObservationRecord = z.infer<typeof recordSchema>;
export const runSchema = z.object({
  status: z.enum(['success','partial','failed','unavailable']), records: z.array(recordSchema).max(500),
  resultState: z.enum(['observed','zero','suppressed','unknown','failed']).default('observed'),
  startedAt: z.string().datetime({ offset:true }).optional(), dataPeriod: short.nullable().default(null),
  requestConditions: z.record(z.string(), z.unknown()).default({}), rawSnapshot: z.string().max(500000).nullable().default(null),
  parserVersion: short.default('manual-v1'), returnedScope: short.default('用户确认的人工记录'),
  truncated: z.boolean().default(false), pagination: z.record(z.string(), z.unknown()).nullable().default(null),
  providerMetadata: z.record(z.string(), z.unknown()).default({}),
  providerUsage: z.record(z.string(), z.unknown()).nullable().default(null),
  costMinor: z.number().int().nonnegative().nullable().default(null), currency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null),
  error: short.nullable().default(null), retryOf: uuid.nullable().default(null),
}).strict().superRefine((r,ctx) => {
  if ((r.status === 'failed' || r.status === 'unavailable') && (r.records.length || r.resultState !== 'failed')) ctx.addIssue({code:'custom',message:'失败/不可用须明确标记 failed，不能保存为零结果'});
  if (r.resultState === 'failed' && r.status !== 'failed' && r.status !== 'unavailable') ctx.addIssue({code:'custom',message:'失败结果须使用失败或不可用状态'});
  if (r.resultState === 'zero' && r.records.length) ctx.addIssue({code:'custom',message:'零结果不能包含记录'});
  if (r.resultState === 'observed' && !r.records.length) ctx.addIssue({code:'custom',message:'空记录须明确标为零结果或未知'});
  if ((r.costMinor === null) !== (r.currency === null)) ctx.addIssue({code:'custom',message:'实际费用与币种须同时提供'});
  if (JSON.stringify(r).length > 2000000) ctx.addIssue({code:'custom',message:'本次输入超过保存上限，请显式拆分并注明范围'});
});
export type RunInput = z.input<typeof runSchema>;
export type NormalizedRun = z.infer<typeof runSchema>;
export type CreateTaskInput = { objectType: 'idea'; objectId: string; gapId?: string | null; config: z.input<typeof configSchema>; requestId: string };
export type TaskVersion = { id: string; task_id: string; revision: number; config: TaskConfig; decision_snapshot: Record<string,unknown>; gap_snapshot: Record<string,unknown> | null; created_at: string };
export type ObservationRun = { id: string; task_id: string; task_version_id: string; payload: NormalizedRun; created_at: string };
export type ObservationTask = { id: string; object_type: 'idea'; object_id: string; gap_id: string | null; created_at: string; versions?: TaskVersion[] };
export function normalizeConfig(input: unknown): TaskConfig { return configSchema.parse(input); }
export function normalizeRun(input: unknown): NormalizedRun { return runSchema.parse(input); }
export function isMissingObservationSchema(error: { code?: string; message: string }): boolean {
  return ['42P01','PGRST205','42883','PGRST202'].includes(error.code ?? '') && /decision_observation_(tasks|versions|runs)|save_decision_observation|attach_observation_gap_ref/.test(error.message);
}
