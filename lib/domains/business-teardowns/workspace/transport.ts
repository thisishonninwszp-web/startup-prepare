import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {workspaceUuid,workspaceCursorSchema,workspaceItemSchema,workspaceQuerySchema,type WorkspaceState} from './domain';
const payload=z.object({items:z.array(workspaceItemSchema).max(20),nextCursor:workspaceCursorSchema.nullable()}).strict();
async function read(owner:string,operation:'case'|'recent',input:{caseId?:string;before?:string}):Promise<WorkspaceState>{
 workspaceUuid.parse(owner);const {before}=workspaceQuerySchema.parse(input.before===undefined?{}:{before:input.before});
 const request={...(input.caseId?{caseId:workspaceUuid.parse(input.caseId)}:{}),...(before?{before:workspaceCursorSchema.parse(JSON.parse(Buffer.from(before,'base64url').toString('utf8')))}:{})};
 const {data,error}=await supabaseAdminUncached.rpc('business_workspace_read',{p_user_id:owner,p_operation:operation,p_input:request});
 if(error){if(['42P01','42883','PGRST202','PGRST205'].includes(error.code))return {available:false,items:[],nextCursor:null};throw Object.assign(new Error(error.message),{code:error.code});}
 const page=payload.parse(data);if(operation==='case'&&page.items.some(item=>item.caseId!==input.caseId))throw new Error('续写记录与请求案例不一致');
 return {available:true,items:page.items,nextCursor:page.nextCursor?Buffer.from(JSON.stringify(page.nextCursor)).toString('base64url'):null};
}
export function loadCaseWorkspace(owner:string,input:{caseId:string;before?:string}){return read(owner,'case',z.object({caseId:workspaceUuid,before:workspaceQuerySchema.shape.before}).strict().parse(input));}
export function loadRecentWorkspace(owner:string,input:{before?:string}={}){return read(owner,'recent',workspaceQuerySchema.parse(input));}
