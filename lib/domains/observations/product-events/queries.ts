import {supabaseAdmin} from '@/lib/supabase';import {uuid,type ProductState,type ProductEvent} from './domain';
type Page=ProductState&{nextRevision:number|null};
export async function loadProductEvents(userId:string):Promise<ProductState>{
 uuid.parse(userId);let cursor=0;const events:ProductEvent[]=[];
 for(;;){const {data,error}=await supabaseAdmin.rpc('list_product_events',{p_user_id:userId,p_after_revision:cursor,p_limit:100});
  if(error){if(['PGRST202','42883'].includes(error.code??'')&&/list_product_events/.test(error.message))return {available:false,sources:[],events:[],links:[],receipts:[]};throw new Error(error.message);}
  if(!data||!Array.isArray(data.events)||!Array.isArray(data.sources)||!Array.isArray(data.links)||!Array.isArray(data.receipts))throw new Error('原型事件加载结果无效');
  const page=data as Page;events.push(...page.events);
  if(page.nextRevision===null)return {available:true,sources:page.sources,links:page.links,receipts:page.receipts,events};if(!Number.isSafeInteger(page.nextRevision)||page.nextRevision<=cursor)throw new Error('原型事件分页版本无效');cursor=page.nextRevision;
 }
}
