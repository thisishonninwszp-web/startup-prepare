import {beforeEach,describe,expect,it,vi} from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc}}));
import {eraseResearch,saveResearch} from './commands';
const id='10000000-0000-4000-8000-000000000001';
const input={kind:'failure' as const,title:'退出披露',caseIds:[id],experienceIds:[],sources:[{key:'s1',kind:'material' as const,id,quote:'本店即日起停止营业',publicConfirmed:true}],payload:{event:'exit',when:'',scope:'store',disclosureKey:'s1',confirmedDisclosure:true,whatChanged:'停止营业',alternative:'可能只是迁址',condition:'同一经营主体',checkNext:'核对公开迁址声明'},expectedRevision:0,requestId:id};
describe('research command boundary',()=>{
 beforeEach(()=>rpc.mockReset());
 it('validates owner and strict payload before any database operation',async()=>{await expect(saveResearch('foreign',input)).rejects.toThrow();await expect(saveResearch(id,{...input,payload:{...input.payload,score:8}})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('uses uncached owner-scoped atomic save and preserves revision result',async()=>{rpc.mockResolvedValue({data:{id,revision:1},error:null});expect(await saveResearch(id,input)).toEqual({id,revision:1});expect(rpc).toHaveBeenCalledWith('business_research_command',{p_user_id:id,p_operation:'save',p_input:input});});
 it('never hides SQL provenance or revision conflict errors',async()=>{rpc.mockResolvedValue({data:null,error:{code:'42501',message:'source owner unavailable'}});await expect(saveResearch(id,input)).rejects.toThrow('source owner unavailable');});
 it('requires an exact valid erase target and request id',async()=>{rpc.mockResolvedValue({data:{},error:null});await eraseResearch(id,{id,requestId:id});expect(rpc).toHaveBeenCalledWith('business_research_command',{p_user_id:id,p_operation:'erase',p_input:{id,requestId:id}});await expect(eraseResearch(id,{id,requestId:'bad'})).rejects.toThrow();});
});
