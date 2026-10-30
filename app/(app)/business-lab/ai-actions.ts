'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsAiEnabled,researchBusinessCase} from '@/lib/domains/business-teardowns/ai-research';
import {validateDraftInput,type DraftInput} from '@/lib/domains/business-teardowns/report-domain';
import {classifyAiError} from '@/lib/ai-gateway';

export async function generateBusinessReportAction(input:DraftInput) {
 if(!businessTeardownsAiEnabled())throw new Error('生意拆解 AI 尚未开启');
 const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');
 validateDraftInput(input);
 try{return await researchBusinessCase(user.id,input);}
 catch(error){
  console.error('business_report_generation_unconfirmed',{requestId:input.requestId,code:classifyAiError(error)});
  return {status:'unconfirmed' as const,message:'本次生成结果未确认。材料已保留；请重新读取报告，核对请求状态后再确认新的生成。不会自动重试。'};
 }
}
