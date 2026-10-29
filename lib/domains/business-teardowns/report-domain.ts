import {uuid} from './domain';
import type {MaterialSnapshot} from './domain';
export const SECTION_KEYS=['offering','trigger','buyers','volume','journey','value','operations','economics','comparison','failure_conditions','transfer','experiment'] as const;
export type Reference={snapshotId:string;quote:string};
export type CaseSection={key:typeof SECTION_KEYS[number];observations:{metricId:string;snapshotId:string}[];interpretations:{text:string;refs:Reference[];competingExplanation:string;distinguishingObservation:string}[];unknowns:string[]};
export type CaseRevision={id:string;caseId:string;revision:number;materialRevision:number;primarySnapshotIds:string[];comparisonSnapshotIds:string[];inputManifestHash:string;sections:CaseSection[];authorship:'manual_template'|'ai_draft';promptVersion:string|null;model:string|null;createdAt:string;erasedAt:string|null};
export type ReportSource=MaterialSnapshot&{role:'primary'|'product'|'comparison'};
export type AIConsent={id:string;caseId:string;materialRevision:number;snapshotIds:string[];comparisonSnapshotIds:string[];publicExcerptDeidentified:boolean;revokedAt:string|null;consumedByRequestId?:string|null;consumedRequestStatus?:'pending'|'completed'|'failed'|'unknown'|null;consumedExpectedReportRevision?:number|null;createdAt:string};
export type DraftInput={caseId:string;materialRevision:number;expectedReportRevision:number;snapshotIds:string[];comparisonSnapshotIds:string[];consentId:string;requestId:string};
export type ConsentInput=Omit<DraftInput,'consentId'|'expectedReportRevision'>&{publicExcerptDeidentified:boolean};
export type DraftLease={requestId:string;leaseToken:string;caseId:string;inputManifestHash:string;materialRevision:number};
export type DraftStart={status:'completed';report:CaseRevision}|{status:'busy'}|{status:'ready';lease:DraftLease;sources:ReportSource[];consent:AIConsent};
export type CaseLesson={id:string;caseId:string;reportId:string;method:string;conditions:string;unknowns:string;createdAt:string};
export type LessonInput={caseId:string;reportId:string;requestId:string;method:string;conditions:string;unknowns:string};
export function validateDraftInput(input:DraftInput):void {uuid(input.caseId);uuid(input.consentId);uuid(input.requestId);if(!Number.isSafeInteger(input.materialRevision)||input.materialRevision<1||!Number.isSafeInteger(input.expectedReportRevision)||input.expectedReportRevision<0)throw new Error('无效报告版本');if(!Array.isArray(input.snapshotIds)||!input.snapshotIds.length||!Array.isArray(input.comparisonSnapshotIds))throw new Error('请明确选择材料');const all=[...input.snapshotIds,...input.comparisonSnapshotIds];all.forEach(uuid);if(all.length>30||new Set(all).size!==all.length)throw new Error('重复或过多材料');}
