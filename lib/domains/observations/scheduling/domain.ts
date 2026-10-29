import {z} from 'zod';
export const schedulingUuid=z.string().uuid();
const scheduleSchema=z.object({configId:schedulingUuid,enabled:z.boolean(),intervalMinutes:z.number().int().min(60).max(43200),dailyBudget:z.number().int().min(1).max(10000),maxAttempts:z.number().int().min(1).max(5).default(3)}).strict();
export type ScheduleConfig=z.input<typeof scheduleSchema>;
export interface ScheduleInput extends ScheduleConfig {scheduleId?:string|null;expectedRevision?:string|null;requestId:string}
export interface ObservationSchedule {id:string;config_id:string;revision:string;enabled:boolean;interval_minutes:number;daily_budget:number;max_attempts:number;failures:number;health:string;last_error:string|null;next_run_at:string;source_binding:Record<string,unknown>}
export interface ScheduleRun {id:string;schedule_id:string;user_id:string;config_id:string;token:string;status:string;lease_until:string;budget_day:string;requests_attempted:number;reserved:number;error:string|null;created_at:string;snapshot_id:string|null}
export interface SchedulingState {available:boolean;schedules:ObservationSchedule[];runs:ScheduleRun[];sources:{id:string;table_id:string;approved_at:string;filters:Record<string,unknown>}[];budgets:{schedule_id:string;budget_day:string;charged:number}[];nextCursor:string|null}
export function normalizeSchedule(value:unknown){return scheduleSchema.parse(value);}
export function retryDelayMinutes(failures:number){return Math.min(60,2**Math.max(0,failures-1));}
export function schedulingEnabled(env:Record<string,string|undefined>=process.env){return env.SCHEDULED_OBSERVATIONS_ENABLED==='true'&&env.STATISTICAL_DENOMINATORS_ENABLED==='true';}
export function schedulingCursor(value?:string|null){if(value==null)return null;if(!/^[1-9][0-9]*$/.test(value)||BigInt(value)>BigInt('9223372036854775807'))throw new Error('无效分页位置');return value;}
