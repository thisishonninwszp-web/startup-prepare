import type {QueuedCandidate,SelectionHistory} from '../rules';
export type SourceConfiguration={mode:'search'|'ranking';keyword?:string;genreId?:string;category:string;priceBand:string;businessModel:string};
export type JobSettings={enabled:boolean;prepareOnOpen:boolean;schedule:string;httpBudget:number;aiBudget:number;sources:SourceConfiguration[];excluded:string[];autoAI:boolean;policyVersion:string;revision:number;consentVersion?:string|null;consentRevokedAt?:string|null};
export type JobResult={status:string;runId?:string;caseId?:string|null;reportId?:string;message?:string|null};
export type JobLease=JobResult&{runId:string;leaseToken:string;localDate:string;settings:JobSettings;candidate?:QueuedCandidate|null;materialStatus:string;reportStatus:string;reportRequestId:string};
export type JobAttempt={id:string;kind:'http'|'ai';stage:string;status:string;usage:unknown|null;operation_reference:string|null;created_at:string};
export type JobState={available:boolean;settings:JobSettings;run:JobLease|null;attempts:JobAttempt[];candidates:QueuedCandidate[];history:SelectionHistory;sourceCursors?:Record<string,number>;credentialAvailable?:boolean};
export const DEFAULT_JOB_SETTINGS:JobSettings={enabled:false,prepareOnOpen:false,schedule:'07:00',httpBudget:12,aiBudget:1,sources:[],excluded:[],autoAI:false,policyVersion:'official-rakuten-scalars-v1',revision:0};
