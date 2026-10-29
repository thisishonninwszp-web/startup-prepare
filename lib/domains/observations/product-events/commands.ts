import {supabaseAdmin} from '@/lib/supabase';
import {normalizeSourceCommand,normalizeEvent,normalizeEventLink,uuid,type ProductSourceCommand,type ProductEventLinkInput,type ProductSource,type ProductReceipt} from './domain';
import {newProductToken,tokenDigest} from './auth';
export class ProductEventError extends Error{constructor(message:string,public code?:string){super(message);}}
async function call<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await supabaseAdmin.rpc(name,args);if(error)throw new ProductEventError(error.message,error.code);if(!data)throw new Error('原型事件操作未完成');return data as T;}
type SourceResult={source:ProductSource|null;receipt:ProductReceipt|null;tokenIssued:boolean;replayed:boolean};
export async function mutateProductSource(userId:string,input:ProductSourceCommand){uuid.parse(userId);const payload=normalizeSourceCommand(input);const generated=['activate','rotate'].includes(payload.action)?newProductToken():null;const data=await call<SourceResult>('mutate_product_event_source',{p_user_id:userId,p:payload,p_token_hash:generated?.hash??null});return {...data,...(data.tokenIssued&&generated?{token:generated.token}:{}),...(data.replayed&&generated?{message:'此请求已处理。令牌不会再次显示；若未保存，请重新轮换。'}:{})};}
export async function ingestProductEvent(token:string,input:unknown){const payload=normalizeEvent(input);return call<{id:string;capturedAt:string;replayed:boolean}>('ingest_product_event',{p_token_hash:tokenDigest(token),p:payload});}
export async function linkProductEvent(userId:string,input:ProductEventLinkInput){uuid.parse(userId);return call<{id:string}>('link_product_event',{p_user_id:userId,p:normalizeEventLink(input)});}
export async function purgeExpiredProductEvents(limit=500):Promise<{erased:number}>{if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new Error('清理批量必须为1至5000的整数');return call('purge_expired_product_events',{p_limit:limit});}
