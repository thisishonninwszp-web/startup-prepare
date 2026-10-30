import {describe,it,expect,vi,beforeEach} from 'vitest';
const {from,rpc,detail}=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),detail:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabaseAdmin:{from,rpc}}));vi.mock('./queries',()=>({loadCaseDetail:detail}));
import {loadBusinessReportState,loadBusinessReportDiagnostics} from './report-queries';
const id='10000000-0000-4000-8000-000000000001';
it('removes diagnostic originals from normal report state and returns none for erased reports',async()=>{
 const raw={id,caseId:id,sections:[{key:'offering',observations:[],interpretations:[],unknowns:['待核对'],validationDiagnostics:[{rejectedText:'只在诊断显示'}]}],erasedAt:null};
 from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({error:null}),range:async()=>({data:[],error:null})};return q;});detail.mockResolvedValue({members:[]});rpc.mockResolvedValue({data:{reports:[raw],available:true,consents:[],lessons:[],publishedReportId:null},error:null});
 expect(JSON.stringify(await loadBusinessReportState(id,id))).not.toContain('只在诊断显示');
 rpc.mockResolvedValue({data:{reports:[{...raw,erasedAt:'now'}]},error:null});expect((await loadBusinessReportDiagnostics(id,id,id)).sections).toEqual([]);
});
it('loads rejected fragments only through an owner/case/report scoped diagnostic read',async()=>{
 rpc.mockReset();rpc.mockResolvedValue({data:{reports:[{id,caseId:id,revision:3,materialRevision:1,promptVersion:'v7',createdAt:'now',erasedAt:null,sections:[{key:'offering',validationDiagnostics:[{rejectedText:'诊断原片段'}]}]}]},error:null});
 const result=await loadBusinessReportDiagnostics(id,id,id);expect(JSON.stringify(result)).toContain('诊断原片段');expect(rpc.mock.calls[0][1]).toMatchObject({p_user_id:id,p_operation:'state',p_input:{caseId:id}});
 await expect(loadBusinessReportDiagnostics(id,id,'20000000-0000-4000-8000-000000000001')).rejects.toThrow('报告不存在');
});
describe('report state',()=>{beforeEach(()=>{from.mockReset();rpc.mockReset();detail.mockReset();});it('leaves A materials usable when migration120 is absent',async()=>{from.mockReturnValue({select:()=>({limit:async()=>({error:{code:'PGRST205'}})})});expect((await loadBusinessReportState(id,id)).available).toBe(false);expect(rpc).not.toHaveBeenCalled();});it('drains owned idea targets beyond first page with stable sorting',async()=>{const ranges:number[]=[];const filters:unknown[]=[];from.mockImplementation((table:string)=>{const q={select:()=>q,eq:(...a:unknown[])=>{filters.push(a);return q;},order:()=>q,limit:async()=>({error:null}),range:async(offset:number)=>{ranges.push(offset);return {data:Array.from({length:offset===0?100:1},(_,n)=>({id:String(offset+n),title:'idea'})),error:null};}};expect(['business_case_revisions','ideas','idea_experiments']).toContain(table);return q;});rpc.mockResolvedValue({data:{available:true,reports:[],consents:[],lessons:[],publishedReportId:null},error:null});detail.mockResolvedValue({members:[]});const state=await loadBusinessReportState(id,id);expect(state.ideaTargets).toHaveLength(101);expect(ranges).toEqual([0,100]);expect(filters).toEqual([['user_id',id],['user_id',id]]);});});
