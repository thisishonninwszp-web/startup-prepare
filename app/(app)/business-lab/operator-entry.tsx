import Link from 'next/link';
import {Button} from '@/components/ui/button';

const tools=[
 ['explanations','这两种解释，怎样区分'],
 ['withdrawals','退出与收缩：哪些条件没能持续'],
 ['pressure','条件变了，你怎么做'],
 ['cash','先付后收，现金够不够'],
 ['cash/boundaries','哪项现金假设会改变结果'],
 ['counterexamples','给自己的方法找反例'],
 ['practice','亲手做一件东西'],
 ['simulation','连续做六回合经营取舍'],
 ['history','查看确认经过与当时条件'],
 ['methods','把调查整理为本人方法'],
] as const;

export function BusinessOperatorEntry({caseId}:{caseId?:string}){
 const query=caseId?`?caseId=${encodeURIComponent(caseId)}`:'';
 return <aside className="space-y-3 rounded-lg border p-5" aria-label="经营练习"><h2 className="text-lg font-medium">把一个经营判断做具体</h2><p className="text-sm leading-7 text-muted-foreground">先想条件变了会怎样，再核对收付款的先后，或用另一个案例检查自己的方法。练习里的假设不算真实顾客验证。</p><div className="flex flex-wrap gap-2">{tools.map(([path,label])=><Button key={path} asChild variant="outline" size="sm"><Link href={`/business-lab/${path}${query}`}>{label}</Link></Button>)}</div></aside>;
}
