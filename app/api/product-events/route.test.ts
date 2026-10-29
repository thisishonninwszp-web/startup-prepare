import {beforeEach,expect,it,vi} from 'vitest';
const ingest=vi.hoisted(()=>vi.fn());vi.mock('@/lib/domains/observations/product-events/commands',async original=>({...await original<typeof import('@/lib/domains/observations/product-events/commands')>(),ingestProductEvent:ingest}));
import {POST} from './route';
const token='a'.repeat(43),event={externalId:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',kind:'no_result',occurredAt:new Date().toISOString(),noticeVersion:'v1',attributes:{}};
const req=(body:unknown,auth=true)=>new Request('https://app.example.com/api/product-events',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();process.env.PRODUCT_EVENTS_ENABLED='true';ingest.mockResolvedValue({id:'saved',replayed:false,capturedAt:'now'});});
it('is default-off and does not accept unauthenticated posts',async()=>{delete process.env.PRODUCT_EVENTS_ENABLED;expect((await POST(req(event))).status).toBe(503);process.env.PRODUCT_EVENTS_ENABLED='true';expect((await POST(req(event,false))).status).toBe(401);expect(ingest).not.toHaveBeenCalled();});
it('rejects free JSON/owner input and bounds streamed bytes without content-length',async()=>{expect((await POST(req({...event,user_id:'owner'}))).status).toBe(400);expect((await POST(req({text:'x'.repeat(9000)}))).status).toBe(413);expect(ingest).not.toHaveBeenCalled();});
it('passes only the bearer token and strict event, returning no token or subject',async()=>{const r=await POST(req(event));expect(r.status).toBe(202);expect(ingest).toHaveBeenCalledWith(token,event);expect(JSON.stringify(await r.json())).not.toContain(token);expect(r.headers.get('cache-control')).toBe('no-store');});
