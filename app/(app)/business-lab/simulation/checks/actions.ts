'use server';

import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listRealityChecks,getRealityCheck,listRealityCheckSources,getRealityCheckSource,realityCheckCommand} from '@/lib/domains/business-teardowns/reality-checks/transport';
import type {RealityCheckCommand} from '@/lib/domains/business-teardowns/reality-checks/domain';

async function owner(){
 if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)throw new Error('请先登录');
 return user.id;
}
export async function realityChecksListAction(input:{caseId?:string;simulationId?:string;before?:string}={}){return listRealityChecks(await owner(),input);}
export async function realityCheckGetAction(id:string){return getRealityCheck(await owner(),id);}
export async function realityCheckSourcesAction(input:{caseId?:string;before?:string}={}){return listRealityCheckSources(await owner(),input);}
export async function realityCheckSourceAction(id:string){return getRealityCheckSource(await owner(),id);}
export async function realityCheckSaveAction(command:RealityCheckCommand){return realityCheckCommand(await owner(),command);}
