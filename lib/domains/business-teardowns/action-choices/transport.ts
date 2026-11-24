import {z} from 'zod';
import {supabaseAdminUncached} from '@/lib/supabase';
import {cashDate,cashUuid} from '../cash/domain';
import type {ActionChoiceIdeas} from './domain';
const stamp=z.string().max(80).refine(value=>{
 const match=/^\d{4}-\d\d-\d\dT(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|([+-])(\d\d):(\d\d))$/.exec(value);
 return !!match&&Number(match[1])<24&&Number(match[2])<60&&Number(match[3])<60&&(!match[4]||(Number(match[5])<=15&&Number(match[6])<60))&&cashDate.safeParse(value.slice(0,10)).success&&Number.isFinite(Date.parse(value));
},'分页日期不正确');
const keyset=z.object({date:stamp,id:cashUuid}).strict();
function decode(value:string){return keyset.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));}
const encoded=z.string().max(400).regex(/^[A-Za-z0-9_-]+$/).refine(value=>{try{return Buffer.from(JSON.stringify(decode(value))).toString('base64url')===value;}catch{return false;}},'分页位置不正确');
const inputSchema=z.object({before:encoded.optional()}).strict();
const pageSchema=z.object({items:z.array(z.object({id:cashUuid,title:z.string(),createdAt:stamp}).strict()).max(20),nextCursor:keyset.nullable()}).strict();
function micros(value:string):bigint{return BigInt(Date.parse(value))*BigInt(1000)+BigInt((value.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0').slice(3,6));}
function compare(a:z.infer<typeof keyset>,b:z.infer<typeof keyset>){const delta=micros(a.date)-micros(b.date);return delta<BigInt(0)?-1:delta>BigInt(0)?1:a.id<b.id?-1:a.id>b.id?1:0;}
export async function loadActionChoiceIdeas(owner:string,input:{before?:string}={}):Promise<ActionChoiceIdeas>{
 const user=cashUuid.parse(owner),parsed=inputSchema.parse(input);
 const {data,error}=await supabaseAdminUncached.rpc('business_action_choice_context',{p_user_id:user,p_operation:'ideas',p_input:parsed.before?{before:decode(parsed.before)}:{}});
 if(error){
  if(['42883','PGRST202'].includes(error.code??'')&&/\b(?:public\.)?business_action_choice_context\b/.test(error.message))return {available:false,items:[],nextCursor:null};
  throw Object.assign(new Error(error.message),{code:error.code});
 }
 const page=pageSchema.parse(data);let previous=parsed.before?decode(parsed.before):null;const ids=new Set<string>();
 for(const item of page.items){const current={date:item.createdAt,id:item.id};if(ids.has(item.id)||(previous&&compare(current,previous)>=0))throw new Error('想法分页顺序不一致');ids.add(item.id);previous=current;}
 if(page.nextCursor&&(!page.items.length||!previous||compare(page.nextCursor,previous)!==0))throw new Error('分页位置与想法不一致');
 return {available:true,items:page.items.map(({id,title})=>({id,title})),nextCursor:page.nextCursor?Buffer.from(JSON.stringify(page.nextCursor)).toString('base64url'):null};
}
