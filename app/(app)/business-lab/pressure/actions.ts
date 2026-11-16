'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {pressureCommand,listPressures,getPressure,listPressureCases,loadPressureContext,requestPressureQuestions,loadPressureDiagnostic,revokePressureConsent} from '@/lib/domains/business-teardowns/pressure/transport';
import type {PressureCommand,PressureAiInput} from '@/lib/domains/business-teardowns/pressure/domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function loadPressuresAction(input:{before?:string}={}){return listPressures(await owner(),input);}
export async function loadPressureRecordAction(id:string){return getPressure(await owner(),id);}
export async function loadPressureCasesAction(input:{before?:string}={}){return listPressureCases(await owner(),input);}
export async function loadPressureContextAction(caseId:string){return loadPressureContext(await owner(),caseId);}
export async function savePressureAction(input:PressureCommand){return pressureCommand(await owner(),input);}
export async function requestPressureQuestionsAction(input:PressureAiInput){return requestPressureQuestions(await owner(),input);}
export async function loadPressureDiagnosticAction(input:{id:string;requestId:string}){return loadPressureDiagnostic(await owner(),input);}
export async function revokePressureConsentAction(input:{id:string;requestId:string}){return revokePressureConsent(await owner(),input);}
