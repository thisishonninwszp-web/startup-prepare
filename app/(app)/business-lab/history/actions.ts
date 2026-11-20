'use server';

import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listConfirmationHistory,getConfirmationNode} from '@/lib/domains/business-teardowns/history/transport';
import type {ConfirmationNodeKey} from '@/lib/domains/business-teardowns/history/domain';

async function owner(){
 if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)throw new Error('请先登录');
 return user.id;
}
export async function confirmationHistoryListAction(input:{caseId?:string;before?:string}={}){return listConfirmationHistory(await owner(),input);}
export async function confirmationHistoryGetAction(key:ConfirmationNodeKey){return getConfirmationNode(await owner(),key);}
