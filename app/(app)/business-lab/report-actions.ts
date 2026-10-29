'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {grantConsent,revokeConsent,publishReport,eraseBusinessContent,type PublishInput} from '@/lib/domains/business-teardowns/report-commands';
import {loadBusinessReportState} from '@/lib/domains/business-teardowns/report-queries';
import {previewBusinessAction,confirmBusinessAction,type BridgeInput,type ActionPreview} from '@/lib/domains/business-teardowns/action-bridge';
import type {ConsentInput} from '@/lib/domains/business-teardowns/report-domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意拆解尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return user.id;}
export async function loadBusinessReportStateAction(input:{caseId:string}){return loadBusinessReportState(await owner(),input.caseId);}
export async function grantBusinessAIConsentAction(input:ConsentInput){if(process.env.BUSINESS_TEARDOWNS_AI_ENABLED!=='true')throw new Error('AI拆解尚未开启');return grantConsent(await owner(),input);}
export async function revokeBusinessAIConsentAction(input:{consentId:string}){return revokeConsent(await owner(),input.consentId);}
export async function publishBusinessReportAction(input:PublishInput){return publishReport(await owner(),input);}
export async function previewBusinessActionAction(input:BridgeInput){return previewBusinessAction(await owner(),input);}
export async function confirmBusinessActionAction(input:{preview:ActionPreview}){return confirmBusinessAction(await owner(),input.preview);}
export async function eraseBusinessContentAction(input:{caseId:string;snapshotId?:string;reportId?:string}){return eraseBusinessContent(await owner(),input);}
