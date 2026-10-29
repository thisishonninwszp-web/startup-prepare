import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({from:vi.fn(),idea:vi.fn(),entries:vi.fn(),sources:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabaseAdmin:{from:m.from}}));
import { loadCompanyIdeaReviews } from "./reviews";
beforeEach(()=>{vi.clearAllMocks();let calls=0;m.idea.mockResolvedValue({data:{id:"idea"},error:null});m.entries.mockResolvedValue({data:[{id:"review",company_id:"company",payload:{sourceEntryId:"source",ideaId:"idea",assumption:"替代方案",unknown:"客户是否采用"},created_at:"2026-10-26"}],error:null});m.sources.mockResolvedValue({data:[{id:"source",company_id:"company",kind:"activity",payload:{title:"新功能",source:{quote:"原文",scope:"片段",url:"https://example.com"}}}],error:null});m.from.mockImplementation((table:string)=>{const result=table==="ideas"?m.idea:++calls===1?m.entries:m.sources;const chain={select:vi.fn(),eq:vi.fn(),order:vi.fn(),in:vi.fn(),limit:result,maybeSingle:result};for(const f of [chain.select,chain.eq,chain.order,chain.in])f.mockReturnValue(chain);return chain;});});
it("returns explicit source and unknown on the target owned idea without changing validation",async()=>{
 const r=await loadCompanyIdeaReviews("11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222");expect(r.items[0]).toMatchObject({assumption:"替代方案",unknown:"客户是否采用",source:{id:"source"}});
});
it("refuses unowned ideas before loading private company material",async()=>{m.idea.mockResolvedValue({data:null,error:null});await expect(loadCompanyIdeaReviews("11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222")).rejects.toThrow();expect(m.entries).not.toHaveBeenCalled();});
