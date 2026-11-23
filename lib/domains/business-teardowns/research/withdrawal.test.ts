import {describe,it,expect,vi} from 'vitest';
import {parseResearchInput} from './domain';

import {listResearchSources,loadResearchSubject} from './queries';
const {rpc,from}=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc,from}}));
const id='10000000-0000-4000-8000-000000000001';
function failure(){return {kind:'failure',title:'退出披露',caseIds:[id],experienceIds:[],sources:[{key:'s1',kind:'material',id,quote:'本店即日起停止营业',publicConfirmed:true}],payload:{event:'exit',when:'',scope:'store',disclosureKey:'s1',confirmedDisclosure:true,whatChanged:'停止营业',alternative:'可能只是迁址',condition:'同一经营主体',checkNext:'核对公开迁址声明'},expectedRevision:0,requestId:id};}
describe('official withdrawal research',()=>{
 it('allows business scope and official exact quotes while retaining manual confirmation',()=>{const input={...failure(),sources:[{...failure().sources[0],kind:'official'}],payload:{...failure().payload,scope:'business'}};expect(()=>parseResearchInput(input)).not.toThrow();expect(()=>parseResearchInput({...input,payload:{...input.payload,confirmedDisclosure:false}})).toThrow();});
 it('uses owner-scoped subject read for exact case beyond the first page',async()=>{rpc.mockResolvedValue({data:{id,name:'Service',date:'2026-11-20'},error:null});expect(await loadResearchSubject(id,id)).toEqual({id,name:'Service',date:'2026-11-20'});expect(rpc).toHaveBeenLastCalledWith('business_research_context',{p_user_id:id,p_operation:'case',p_input:{caseId:id}});});
 it('requires selected owned cases for official source browsing',async()=>{rpc.mockResolvedValue({data:{items:[],nextCursor:null},error:null});await listResearchSources(id,{kind:'official',caseIds:[id]});expect(rpc).toHaveBeenLastCalledWith('business_research_context',{p_user_id:id,p_operation:'sources',p_input:{caseIds:[id]}});await expect(listResearchSources(id,{kind:'official'})).rejects.toThrow();});
});
