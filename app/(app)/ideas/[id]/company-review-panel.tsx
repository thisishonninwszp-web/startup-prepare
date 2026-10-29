import Link from "next/link";
import { loadCompanyIdeaReviews } from "@/lib/domains/observations/companies/reviews";
import type { CompanyActivity, CompanyIdentity } from "@/lib/domains/observations/companies/domain";

export async function CompanyReviewPanel({userId,ideaId}:{userId:string;ideaId:string}) {
  let state:Awaited<ReturnType<typeof loadCompanyIdeaReviews>>;
  try{state=await loadCompanyIdeaReviews(userId,ideaId);}catch{return <p className="mt-6 rounded border p-4 text-sm text-muted-foreground">企业复查材料暂未读到，不代表相关问题已解决。</p>;}
  if(!state.available)return <p className="mt-6 text-xs text-muted-foreground">企业研究关联需要完成数据库更新，既有想法记录仍可使用。</p>;
  if(!state.items.length)return null;
  return <section className="mt-8 space-y-4 rounded-lg border bg-card p-4"><h2 className="font-semibold">企业材料带来的复查问题</h2><p className="text-xs leading-6 text-muted-foreground">这是你明确关联到此想法的记录，不自动判断问题是否解决，也不改动痛点、付费或想法状态。</p>{state.items.map(item=>{
    const source=item.source?.kind==="identity"?(item.source.payload.identity as CompanyIdentity|undefined)?.source:(item.source?.payload as unknown as CompanyActivity|undefined)?.source;
    return <article key={item.id} className="space-y-2 border-t pt-3 text-sm leading-7"><p className="font-medium">需要复查：{item.assumption}</p><p>仍然未知：{item.unknown}</p>{source&&<details className="text-xs"><summary className="cursor-pointer">核对关联材料与出处</summary><blockquote className="mt-2 whitespace-pre-wrap break-words border-l pl-3">{source.quote}</blockquote><p className="mt-2 text-muted-foreground">覆盖范围：{source.scope}</p>{source.url&&<a className="break-all text-primary underline" href={source.url} target="_blank" rel="noopener noreferrer">来源网页 ↗</a>}</details>}<Link className="text-xs text-primary hover:underline" href={`/companies/${item.companyId}`}>回到企业档案与完整历史 →</Link></article>;
  })}{state.capped&&<p className="text-xs text-muted-foreground">此处显示最近20条，其他关联请在企业档案查看。</p>}</section>;
}
