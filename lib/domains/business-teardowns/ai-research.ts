import {generateBusinessTeardownReport,BUSINESS_REPORT_PROMPT_VERSION,MODEL} from '@/lib/ai';
import {startDraft,verifyDraft,finishDraft,failDraft} from './report-commands';
import {validateBusinessReport} from './report-validation';
import type {DraftInput,CaseRevision} from './report-domain';

export function businessTeardownsAiEnabled():boolean {return process.env.BUSINESS_TEARDOWNS_ENABLED==='true'&&process.env.BUSINESS_TEARDOWNS_AI_ENABLED==='true';}

export async function researchBusinessCase(ownerId:string,input:DraftInput):Promise<{status:'completed';report:CaseRevision}|{status:'busy'}> {
 const started=await startDraft(ownerId,input);
 if(started.status!=='ready')return started;
 const {lease}=started;
 try {
  const before=await verifyDraft(ownerId,lease);
  const sections=await generateBusinessTeardownReport({ownerId,caseId:input.caseId,requestId:input.requestId,sources:before.sources});
  const after=await verifyDraft(ownerId,lease);
  const checked=validateBusinessReport({sections},after.sources);
  const report=await finishDraft(ownerId,lease,{sections:checked,model:MODEL,promptVersion:BUSINESS_REPORT_PROMPT_VERSION});
  return {status:'completed',report};
 } catch(error) {
  // A lost callback must never trigger another provider call or hide the original failure.
  try {await failDraft(ownerId,lease);}catch {/* Receipt remains pending/unknown until an explicit follow-up. */}
  throw error;
 }
}
