import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {loadRecentWorkspace} from '@/lib/domains/business-teardowns/workspace/transport';
import {workspaceHref} from '@/lib/domains/business-teardowns/workspace/domain';

export async function BusinessResumeEntry({owner}:{owner:string}){
 try{
  const state=await loadRecentWorkspace(owner);
  if(!state.available)return <p role="status" className="text-sm leading-7 text-muted-foreground">继续研究暂未就绪，已有练习仍可从各个入口打开。</p>;
  const latest=state.items[0];
  if(!latest)return null;
  return <aside aria-label="继续最近的经营判断" className="space-y-3 rounded-lg border bg-card p-5">
   <p className="font-mono text-xs text-muted-foreground">继续上次保存的内容</p>
   <h2 className="text-lg font-medium">{latest.caseTitle}</h2>
   <p className="break-words text-sm leading-7">{latest.title}</p>
   <div className="flex flex-wrap gap-2"><Button asChild size="sm"><Link href={workspaceHref(latest)}>打开这份记录</Link></Button><Button asChild size="sm" variant="outline"><Link href={`/business-lab/${latest.caseId}#continuation`}>看这门生意的全部练习</Link></Button></div>
  </aside>;
 }catch{
  return <p role="alert" className="text-sm leading-7 text-muted-foreground">最近保存的记录暂时没有读到。已有内容仍可从各项练习打开，请稍后重试。</p>;
 }
}
