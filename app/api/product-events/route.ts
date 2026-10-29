import {ZodError} from 'zod';
import {normalizeEvent} from '@/lib/domains/observations/product-events/domain';
import {ingestProductEvent,ProductEventError} from '@/lib/domains/observations/product-events/commands';
export const runtime='nodejs';
function response(status:number,body:Record<string,unknown>){return Response.json(body,{status,headers:{'cache-control':'no-store'}});}
async function boundedBody(request:Request):Promise<string>{
 const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>8192))throw new RangeError('body too large');
 const reader=request.body?.getReader();if(!reader)throw new SyntaxError('body required');const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new RangeError('body too large');}chunks.push(value);}}finally{reader.releaseLock();}
 const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(buffer);
}
export async function POST(request:Request){
 if(process.env.PRODUCT_EVENTS_ENABLED!=='true')return response(503,{error:'原型事件接入尚未开启'});
 const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');if(!match)return response(401,{error:'接入令牌无效'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return response(415,{error:'需要 JSON 事件'});
 try{const payload=normalizeEvent(JSON.parse(await boundedBody(request)));const data=await ingestProductEvent(match[1],payload);return response(202,{id:data.id,capturedAt:data.capturedAt,replayed:data.replayed});}
 catch(error){if(error instanceof RangeError)return response(413,{error:'事件请求超出大小上限'});if(error instanceof ZodError||error instanceof SyntaxError||error instanceof TypeError)return response(400,{error:'事件格式无效，不接受原始搜索词或个人资料'});if(error instanceof ProductEventError){if(error.code==='42501')return response(401,{error:'原型未激活或令牌不可用'});if(error.code==='54000')return response(429,{error:'原型事件达到速率上限'});if(error.code==='23505')return response(409,{error:'外部事件ID已使用且内容不同'});if(/notice|retention window|event kind|invalid|unsupported/.test(error.message))return response(400,{error:'告知版本、事件定义或时间窗口不匹配'});}return response(503,{error:'事件暂未收录，请使用同一外部事件ID重试'});}
}
