import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from './domain';
import {canPublishBusinessReport} from './report-partial';
import {validateDraftInput,type DraftInput,type DraftLease,type DraftStart,type AIConsent,type ConsentInput,type CaseRevision,type CaseSection,type ReportSource,type LessonInput,type CaseLesson} from './report-domain';
export async function reportCommand<T>(owner:string,operation:string,input:object):Promise<T> {uuid(owner);const {data,error}=await supabaseAdmin.rpc('business_report_command',{p_user_id:owner,p_operation:operation,p_input:input});if(error)throw new Error(error.message);return data as T;}
export function grantConsent(owner:string,input:ConsentInput):Promise<AIConsent>{validateDraftInput({...input,consentId:input.requestId,expectedReportRevision:0});if(input.publicExcerptDeidentified!==true)throw new Error('请确认仅包含公开且去标识的材料');return reportCommand(owner,'consent',input);}
export function revokeConsent(owner:string,consentId:string):Promise<void>{uuid(consentId);return reportCommand(owner,'revoke',{consentId});}
export async function startDraft(owner:string,input:DraftInput):Promise<DraftStart>{validateDraftInput(input);const result=await reportCommand<DraftStart|{status:'unknown'}>(owner,'start',input);if(result.status==='unknown')throw new Error('上次请求结果或用量未知，请重新确认后使用新请求');return result;}
export function verifyDraft(owner:string,lease:DraftLease):Promise<{sources:ReportSource[];consent:AIConsent}>{return reportCommand(owner,'verify',lease);}
export function finishDraft(owner:string,lease:DraftLease,report:{sections:CaseSection[];model:string|null;promptVersion:string|null}):Promise<CaseRevision>{return reportCommand(owner,'finish',{...lease,report});}
export function failDraft(owner:string,lease:DraftLease):Promise<void>{return reportCommand(owner,'fail',lease);}
export type PublishInput={caseId:string;reportId:string;expectedPublishedReportId:string|null;requestId:string};
export async function publishReport(owner:string,input:PublishInput):Promise<CaseRevision>{uuid(input.caseId);uuid(input.reportId);uuid(input.requestId);if(input.expectedPublishedReportId)uuid(input.expectedPublishedReportId);
 const state=await reportCommand<{reports:CaseRevision[]}>(owner,'state',{caseId:input.caseId});
 const report=state.reports.find(report=>report.id===input.reportId);
 if(!report)throw new Error('报告不存在');
 if(!canPublishBusinessReport(report.sections))throw new Error('没有通过校验的经营解释，不能发布此部分报告');
 return reportCommand(owner,'publish',input);
}
export function saveCaseLesson(owner:string,input:LessonInput):Promise<CaseLesson>{uuid(input.caseId);uuid(input.reportId);uuid(input.requestId);return reportCommand(owner,'lesson',input);}
export async function eraseBusinessContent(owner:string,input:{caseId:string;snapshotId?:string;reportId?:string}):Promise<void>{uuid(owner);uuid(input.caseId);if(input.snapshotId)uuid(input.snapshotId);if(input.reportId)uuid(input.reportId);if(Boolean(input.snapshotId)===Boolean(input.reportId))throw new Error('请选择一个来源或报告');const {error}=await supabaseAdmin.rpc('business_erase_content',{p_user_id:owner,p_case_id:input.caseId,p_snapshot_id:input.snapshotId??null,p_report_id:input.reportId??null});if(error)throw new Error(error.message);}
