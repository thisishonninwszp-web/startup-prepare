import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {loadCaseWorkspace} from '@/lib/domains/business-teardowns/workspace/transport';
import {BusinessWorkspacePanel} from './workspace-panel';
export async function BusinessCaseWorkspace({caseId}:{caseId:string}){if(!businessTeardownsEnabled())return null;const {data:{user}}=await createClient().auth.getUser();if(!user)return null;try{return <BusinessWorkspacePanel key={caseId} caseId={caseId} initialState={await loadCaseWorkspace(user.id,{caseId})}/>;}catch{return <p role="alert" className="rounded-lg border p-4 text-sm leading-7">保存过的工作暂时没有读到。刷新后可重试，各项练习仍可单独打开。</p>;}}
