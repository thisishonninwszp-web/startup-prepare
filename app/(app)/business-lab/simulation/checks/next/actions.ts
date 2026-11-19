'use server';

import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listFollowupChecks,getFollowupCheck,getFollowupCheckSource,followupCheckCommand} from '@/lib/domains/business-teardowns/followup-checks/transport';
import type {FollowupCheckCommand} from '@/lib/domains/business-teardowns/followup-checks/domain';
import {listRealityResults} from '@/lib/domains/business-teardowns/reality-results/transport';

async function owner(){
 if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)throw new Error('请先登录');
 return user.id;
}
export async function followupChecksListAction(input:{caseId?:string;resultId?:string;before?:string}={}){return listFollowupChecks(await owner(),input);}
export async function followupCheckGetAction(id:string){return getFollowupCheck(await owner(),id);}
export async function followupCheckSourceAction(id:string){return getFollowupCheckSource(await owner(),id);}
export async function followupCheckSaveAction(command:FollowupCheckCommand){return followupCheckCommand(await owner(),command);}
export async function followupCheckSourcesAction(input:{caseId?:string;before?:string}={}){return listRealityResults(await owner(),input);}
