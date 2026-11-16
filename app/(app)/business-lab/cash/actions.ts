'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {cashCommand,listCash,getCash,listCashCases,loadCashContext} from '@/lib/domains/business-teardowns/cash/transport';
import type {CashCommand} from '@/lib/domains/business-teardowns/cash/domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function cashSaveAction(input:CashCommand){return cashCommand(await owner(),input);}
export async function cashListAction(input:{before?:string}={}){return listCash(await owner(),input);}
export async function cashGetAction(input:{id:string}){return getCash(await owner(),input.id);}
export async function cashCasesAction(input:{before?:string}={}){return listCashCases(await owner(),input);}
export async function cashContextAction(input:{caseId:string}){return loadCashContext(await owner(),input.caseId);}
