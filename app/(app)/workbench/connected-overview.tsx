import Link from "next/link";
import { loadDeferredExperimentQuestions } from "./connected-overview-queries";

export async function ConnectedOverview({ userId }: { userId: string }) {
  let state: Awaited<ReturnType<typeof loadDeferredExperimentQuestions>>;
  try { state = await loadDeferredExperimentQuestions(userId); }
  catch { return <p className="mb-6 rounded border p-4 text-sm text-muted-foreground">暂未读到待接触问题；这不表示问题已解决。请重新打开工作台或到关联想法查看。</p>; }
  if (!state.available) return <p className="mb-6 rounded border p-4 text-sm text-muted-foreground">实验记录需要完成数据库更新；已有决策与真实验证仍可使用。</p>;
  return <section className="mb-6 space-y-3 rounded-lg border bg-card p-4"><h2 className="text-sm font-medium">仍要向真人核对的问题</h2><p className="text-xs leading-6 text-muted-foreground">从最近50份实验版本中按系列取最新一版，不以自测通过替代这些问题。记录保留供你复查，不自动判断是否已经得到答案。</p>{state.items.length ? <ul className="space-y-3">{state.items.map(item => <li key={item.id} className="text-xs leading-6"><Link className="font-medium text-primary hover:underline" href={`/ideas/${item.ideaId}#connected-learning`}>{item.question} →</Link><ul className="mt-1 list-disc pl-4">{item.questions.slice(0, 3).map((q,i) => <li key={i}>{q}</li>)}</ul>{item.questions.length > 3 && <p className="text-muted-foreground">其余问题在实验详情查看。</p>}{item.recheckOn && <p className="text-muted-foreground">重新检查接触条件：{item.recheckOn}</p>}</li>)}</ul> : <p className="text-xs text-muted-foreground">最近实验尚未留下待接触问题。可以从想法的信息缺口建立一张实验卡。</p>}{state.capped && <p className="text-xs text-muted-foreground">更早版本未全部载入；请到对应想法翻页查看。</p>}</section>;
}
