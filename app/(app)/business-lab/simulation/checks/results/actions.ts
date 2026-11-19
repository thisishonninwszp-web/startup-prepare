'use server';

import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listRealityResults,getRealityResult,listRealityResultPlans,listRealityResultVersions,getRealityResultVersion,realityResultCommand} from '@/lib/domains/business-teardowns/reality-results/transport';
import type {RealityResultCommand} from '@/lib/domains/business-teardowns/reality-results/domain';

async function owner(){
 if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)throw new Error('请先登录');
 return user.id;
}
export async function realityResultsListAction(input:{caseId?:string;planId?:string;before?:string}={}){return listRealityResults(await owner(),input);}
export async function realityResultGetAction(id:string){return getRealityResult(await owner(),id);}
export async function realityResultPlansAction(input:{caseId?:string;before?:string}={}){return listRealityResultPlans(await owner(),input);}
export async function realityResultVersionsAction(input:{planId:string;before?:string}){return listRealityResultVersions(await owner(),input);}
export async function realityResultVersionAction(input:{planId:string;revision?:number}){return getRealityResultVersion(await owner(),input);}
export async function realityResultSaveAction(command:RealityResultCommand){return realityResultCommand(await owner(),command);}
