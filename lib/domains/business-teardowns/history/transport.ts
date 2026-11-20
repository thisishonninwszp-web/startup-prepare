import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {confirmationUuid,confirmationNodeSchema,confirmationNodeKeySchema,confirmationCursorSchema,compareConfirmationKeys,type ConfirmationHistory,type ConfirmationNode,type ConfirmationNodeKey,type ConfirmationCursor} from './domain';

function decode(value:string):ConfirmationCursor{return confirmationCursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));}
function encode(value:ConfirmationCursor):string{return Buffer.from(JSON.stringify(value)).toString('base64url');}
const cursor=z.string().max(500).regex(/^[A-Za-z0-9_-]+$/).refine(value=>{try{return encode(decode(value))===value;}catch{return false;}},'分页位置不正确');
const listInput=z.object({caseId:confirmationUuid.optional(),before:cursor.optional()}).strict();
const pageSchema=z.object({items:z.array(confirmationNodeSchema).max(20),nextCursor:confirmationCursorSchema.nullable()}).strict();
async function rpc<T>(owner:string,operation:string,input:unknown,schema:z.ZodType<T>):Promise<T>{
 const user=confirmationUuid.parse(owner);
 const {data,error}=await supabaseAdminUncached.rpc('business_confirmation_history_read',{p_user_id:user,p_operation:operation,p_input:input});
 if(error)throw Object.assign(new Error(error.message),{code:error.code});
 return schema.parse(data);
}
export async function listConfirmationHistory(owner:string,input:{caseId?:string;before?:string}={}):Promise<ConfirmationHistory>{
 const parsed=listInput.parse(input);
 try{
  const page=await rpc(owner,'list',{...(parsed.caseId?{caseId:parsed.caseId}:{}),...(parsed.before?{before:decode(parsed.before)}:{})},pageSchema);
  let previous=parsed.before?decode(parsed.before):null;const identities=new Set<string>();
  for(const item of page.items){
   const identity=`${item.kind}:${item.id}:${item.revision}`;
   if((parsed.caseId&&item.caseId!==parsed.caseId)||identities.has(identity)||(previous&&compareConfirmationKeys(item,previous)>=0))throw new Error('确认履历顺序或来源不一致');
   identities.add(identity);previous=item;
  }
  if(page.nextCursor&&(!page.items.length||!previous||compareConfirmationKeys(page.nextCursor,previous)!==0))throw new Error('分页位置与确认履历不一致');
  return {available:true,items:page.items,nextCursor:page.nextCursor?encode(page.nextCursor):null};
 }catch(error){
  if(['42P01','42883','PGRST202','PGRST205'].includes((error as {code?:string}).code??''))return {available:false,items:[],nextCursor:null};
  throw error;
 }
}
export async function getConfirmationNode(owner:string,key:ConfirmationNodeKey):Promise<ConfirmationNode|null>{
 const parsed=confirmationNodeKeySchema.parse(key),node=await rpc(owner,'get',parsed,confirmationNodeSchema.nullable());
 if(node&&(node.id!==parsed.id||node.kind!==parsed.kind||(parsed.kind==='plan'&&node.revision!==parsed.revision)))throw new Error('读取确认履历与请求不一致');
 return node;
}
