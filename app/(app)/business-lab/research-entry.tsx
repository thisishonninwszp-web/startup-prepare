import Link from 'next/link';
import {Button} from '@/components/ui/button';

export function BusinessResearchEntry({caseId}:{caseId?:string}){
 const href=caseId?`/business-lab/research?caseId=${encodeURIComponent(caseId)}`:'/business-lab/research';
 return <aside className="space-y-3 rounded-lg border p-5" aria-label="四项生意研究"><h2 className="text-lg font-medium">把案例连起来看</h2><p className="text-sm leading-7 text-muted-foreground">查退出案例、对照经营结构、整理需求矛盾，或把想学的经营环节接到自己的经历和岗位上。每份研究保留出处与待核对的问题。</p><Button asChild variant="outline"><Link href={href}>{caseId?'用这个案例开始研究':'打开四项研究'}</Link></Button></aside>;
}
