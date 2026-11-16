'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {practiceCommand,listPractices,getPractice,listPracticeCases,loadPracticeContext,listPracticeApprenticeships} from '@/lib/domains/business-teardowns/practice/transport';
import type {PracticeCommand} from '@/lib/domains/business-teardowns/practice/domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function loadPracticesAction(input:{before?:string}={}){return listPractices(await owner(),input);}
export async function loadPracticeRecordAction(id:string){return getPractice(await owner(),id);}
export async function loadPracticeCasesAction(input:{before?:string}={}){return listPracticeCases(await owner(),input);}
export async function loadPracticeContextAction(caseId:string){return loadPracticeContext(await owner(),caseId);}
export async function loadPracticeApprenticeshipsAction(input:{caseId:string;before?:string}){return listPracticeApprenticeships(await owner(),input);}
export async function savePracticeAction(input:PracticeCommand){return practiceCommand(await owner(),input);}
