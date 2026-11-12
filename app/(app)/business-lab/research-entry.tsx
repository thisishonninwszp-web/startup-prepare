import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {RESEARCH_LABELS} from '@/lib/domains/business-teardowns/research/presentation';
import {RESEARCH_KINDS} from '@/lib/domains/business-teardowns/research/domain';
import {researchStartHref} from '@/lib/domains/business-teardowns/research/start-parameters';

export function BusinessResearchEntry({caseId}:{caseId?:string}){
 return <aside className="space-y-3 rounded-lg border p-5" aria-label="四项生意研究"><h2 className="text-lg font-medium">把案例连起来看</h2><p className="text-sm leading-7 text-muted-foreground">带着案例和出处继续：对照经营结构、整理需求矛盾，或把想学的经营环节接到自己的经历和岗位上。下稿先摆来源，仍待你核对。</p><div className="flex flex-wrap gap-2">{caseId?RESEARCH_KINDS.map(kind=><Button key={kind} asChild variant="outline" size="sm"><Link href={researchStartHref(caseId,kind)}>{RESEARCH_LABELS[kind]}</Link></Button>):<Button asChild variant="outline"><Link href={researchStartHref()}>打开四项研究</Link></Button>}</div></aside>;
}
