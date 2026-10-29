'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsAiEnabled,researchBusinessCase} from '@/lib/domains/business-teardowns/ai-research';
import {validateDraftInput,type DraftInput} from '@/lib/domains/business-teardowns/report-domain';

export async function generateBusinessReportAction(input:DraftInput) {
 if(!businessTeardownsAiEnabled())throw new Error('生意拆解 AI 尚未开启');
 const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');
 validateDraftInput(input);
 return researchBusinessCase(user.id,input);
}
