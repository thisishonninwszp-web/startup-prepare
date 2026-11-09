import {it,expect,vi,afterEach} from 'vitest';
const {createClient}=vi.hoisted(()=>({createClient:vi.fn(()=>({rpc:vi.fn()}))}));
vi.mock('@supabase/supabase-js',()=>({createClient}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();vi.clearAllMocks();});
it('uncached admin reads bypass framework caching without changing request authorization',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-only');
 const fetch=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetch);
 const clientModule=await import('./supabase');
 expect(clientModule).toHaveProperty('supabaseAdminUncached');
 void clientModule.supabaseAdminUncached.rpc;
 const options=(createClient.mock.calls as unknown as [string,string,{global:{fetch:typeof globalThis.fetch}}][])[0][2];
 const init={method:'POST',headers:{Authorization:'Bearer test-only'},body:'{}',cache:'force-cache' as const};
 await options.global.fetch('https://example.supabase.co/rest/v1/rpc/test',init);
 expect(fetch).toHaveBeenCalledWith('https://example.supabase.co/rest/v1/rpc/test',{...init,cache:'no-store'});
});
