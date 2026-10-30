import {supabaseAdmin} from '@/lib/supabase';
import {uuid} from './domain';
import {reportCommand} from './report-commands';
import {loadCaseDetail} from './queries';
import type {CaseRevision,AIConsent,CaseLesson,ReportSource} from './report-domain';
import {publicBusinessReport} from './report-domain';
export async function loadBusinessReportDiagnostics(owner:string,caseId:string,reportId:string){
 uuid(owner);uuid(caseId);uuid(reportId);
 const state=await reportCommand<{reports:CaseRevision[]}>(owner,'state',{caseId});
 const report=state.reports.find(report=>report.id===reportId&&report.caseId===caseId);
 if(!report)throw new Error('报告不存在');
 return {reportId,revision:report.revision,materialRevision:report.materialRevision,promptVersion:report.promptVersion,model:report.model,createdAt:report.createdAt,erased:!!report.erasedAt,sections:report.erasedAt?[]:report.sections.flatMap(section=>section.validationDiagnostics?.length?[{key:section.key,items:section.validationDiagnostics}]:[])};
}
export type BusinessReportState={available:boolean;reports:CaseRevision[];consents:AIConsent[];publishedReportId:string|null;lessons:CaseLesson[];sources:ReportSource[];ideaTargets:{id:string;title:string}[];experimentAvailable:boolean;aiEnabled:boolean};
export async function loadBusinessReportState(owner:string,caseId:string):Promise<BusinessReportState>{uuid(owner);uuid(caseId);const base:BusinessReportState={available:false,reports:[],consents:[],publishedReportId:null,lessons:[],sources:[],ideaTargets:[],experimentAvailable:false,aiEnabled:process.env.BUSINESS_TEARDOWNS_ENABLED==='true'&&process.env.BUSINESS_TEARDOWNS_AI_ENABLED==='true'};
 const {error}=await supabaseAdmin.from('business_case_revisions').select('id').limit(0);if(error){if(['42P01','PGRST205'].includes(error.code))return base;throw new Error(error.message);}
 const state=await reportCommand<Pick<BusinessReportState,'available'|'reports'|'consents'|'publishedReportId'|'lessons'>>(owner,'state',{caseId});const detail=await loadCaseDetail(owner,caseId);if(!detail)throw new Error('案例不存在');
 const ideaTargets:{id:string;title:string}[]=[];for(let offset=0;;offset+=100){const {data:ideas,error:ie}=await supabaseAdmin.from('ideas').select('id,title').eq('user_id',owner).order('created_at',{ascending:false}).order('id').range(offset,offset+99);if(ie){if(['42P01','PGRST205'].includes(ie.code))break;throw new Error(ie.message);}ideaTargets.push(...(ideas??[]));if(!ideas||ideas.length<100)break;}
 const {error:ee}=await supabaseAdmin.from('idea_experiments').select('id').limit(0);
 return {...base,...state,reports:state.reports.map(publicBusinessReport),sources:detail.members.map(m=>({...m.snapshot,role:m.role})),ideaTargets,experimentAvailable:!ee};}
