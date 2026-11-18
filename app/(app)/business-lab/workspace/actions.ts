'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {loadCaseWorkspace} from '@/lib/domains/business-teardowns/workspace/transport';
export async function loadCaseWorkspaceAction(input:{caseId:string;before?:string}){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return loadCaseWorkspace(user.id,input);}
