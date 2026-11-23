'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listExplanationPlans,getExplanationPlan,getExplanationSource,explanationCommand} from '@/lib/domains/business-teardowns/explanations/transport';
import type {ExplanationAnchor,ExplanationCommand} from '@/lib/domains/business-teardowns/explanations/domain';
async function owner(){if(!businessTeardownsEnabled())throw Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw Error('请先登录');return user.id;}
export async function explanationListAction(input:{caseId?:string;before?:string}={}){return listExplanationPlans(await owner(),input);}
export async function explanationGetAction(id:string,revision?:number){return getExplanationPlan(await owner(),id,revision);}
export async function explanationSourceAction(anchor:ExplanationAnchor){return getExplanationSource(await owner(),anchor);}
export async function explanationSaveAction(input:ExplanationCommand){return explanationCommand(await owner(),input);}
