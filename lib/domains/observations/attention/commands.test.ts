import {vi,describe,it,expect,beforeEach} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc}}));
import {saveAttention} from './commands';
import {loadAttention} from './queries';
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
beforeEach(()=>rpc.mockReset());
describe('attention boundaries',()=>{
 it('rejects client selected ordinals before RPC',async()=>{await expect(saveAttention(id,id,{kind:'register',requestId:id,versionId:id,payload:{snapshotId:id,choice:'skip',ordinal:1}})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('passes explicit choice and identity to the atomic owner RPC',async()=>{rpc.mockResolvedValue({data:{id},error:null});await saveAttention(id,id,{kind:'register',requestId:id,versionId:id,payload:{snapshotId:id,choice:'skip'}});expect(rpc).toHaveBeenCalledWith('save_reading_attention',expect.objectContaining({p_payload:{snapshotId:id,choice:'skip',contractMatch:'unknown'},p_version_id:id}));});
 it('reports missing migration explicitly and retains string keyset',async()=>{rpc.mockResolvedValue({data:null,error:{message:'function page_reading_attention does not exist'}});expect(await loadAttention(id,id,'9007199254740993')).toEqual({available:false,entries:[],nextCursor:null});expect(rpc).toHaveBeenCalledWith('page_reading_attention',expect.objectContaining({p_after:'9007199254740993'}));});
});

