'use server';

import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listResultMethods,getResultMethod,getResultMethodSource,resultMethodCommand} from '@/lib/domains/business-teardowns/result-methods/transport';
import type {ResultMethodCommand} from '@/lib/domains/business-teardowns/result-methods/domain';
import {listRealityResults} from '@/lib/domains/business-teardowns/reality-results/transport';

async function owner(){
 if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)throw new Error('请先登录');
 return user.id;
}
export async function resultMethodsListAction(input:{caseId?:string;resultId?:string;before?:string}={}){return listResultMethods(await owner(),input);}
export async function resultMethodGetAction(id:string){return getResultMethod(await owner(),id);}
export async function resultMethodSourceAction(id:string){return getResultMethodSource(await owner(),id);}
export async function resultMethodSaveAction(command:ResultMethodCommand){return resultMethodCommand(await owner(),command);}
export async function resultMethodSourcesAction(input:{caseId?:string;before?:string}={}){return listRealityResults(await owner(),input);}
