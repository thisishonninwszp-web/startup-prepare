'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listCounterexamples,getCounterexample,listCounterexampleMethods,loadCounterexampleMethod,listCounterexampleCases,loadCounterexampleCase,commandCounterexample} from '@/lib/domains/business-teardowns/counterexamples/transport';
import type {CounterexampleCommand} from '@/lib/domains/business-teardowns/counterexamples/domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function loadCounterexamplesAction(input:{before?:string}={}){return listCounterexamples(await owner(),input);}
export async function loadCounterexampleAction(id:string){return getCounterexample(await owner(),id);}
export async function loadCounterexampleMethodsAction(input:{query?:string;before?:string}={}){return listCounterexampleMethods(await owner(),input);}
export async function loadCounterexampleMethodAction(input:{id:string;kind:'learning'|'lesson'}){return loadCounterexampleMethod(await owner(),input);}
export async function loadCounterexampleCasesAction(input:{before?:string}={}){return listCounterexampleCases(await owner(),input);}
export async function loadCounterexampleCaseAction(id:string){return loadCounterexampleCase(await owner(),id);}
export async function saveCounterexampleAction(input:CounterexampleCommand){return commandCounterexample(await owner(),input);}
