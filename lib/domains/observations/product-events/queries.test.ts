import {expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc}}));
import {loadProductEvents} from './queries';
it('reads all event pages without retaining duplicate source bundles',async()=>{const state={available:true,sources:[],events:[{id:'1',revision:1}],links:[],receipts:[],nextRevision:1};rpc.mockResolvedValueOnce({data:state,error:null}).mockResolvedValueOnce({data:{...state,events:[{id:'2',revision:2}],nextRevision:null},error:null});const data=await loadProductEvents('bbbbbbbb-bbbb-4bbb-8bbb-000000000001');expect(data.events.map(e=>e.id)).toEqual(['1','2']);});
