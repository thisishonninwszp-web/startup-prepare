import Link from "next/link";
import { understandingChanges } from "@/lib/domains/signals/events/understanding";
import { eventsEnabled } from "./enabled";

export async function UnderstandingReview({ viewerId, start, endExclusive }: { viewerId: string; start: string; endExclusive: string }) {
  if (!eventsEnabled()) return null;
  let result;
  try { result = await understandingChanges(viewerId, start, endExclusive); }
  catch { return <section className="mt-8 rounded-lg border p-4"><h2 className="font-semibold">我的理解变化</h2><p className="mt-2 text-sm text-muted-foreground">这次未能读取个人记录，请稍后刷新；不把读取失败当作你没有变化。</p></section>; }
  return <section className="mt-8 rounded-lg border bg-card p-4"><h2 className="font-semibold">我的理解变化</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">只引用你实际写过的笔记和判断，不推测你当时怎么想。这一块是私人记录，不进入共用周报。</p>{!result.available ? <p className="mt-3 text-sm">个人事件记录尚未启用。</p> : result.changes.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">这段时间没有留下可回看的理解修正；不替你编造过去的想法。</p> : <ol className="mt-4 space-y-4">{result.changes.map((row) => <li key={row.id} className="border-t pt-3 text-sm leading-7"><Link href={row.href} className="font-medium hover:text-primary">{row.title}</Link><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.at))}</p>{row.before && <p className="mt-2 text-muted-foreground">原记录：「{row.before}」</p>}<p>后来记录：「{row.after}」</p><p className="text-xs text-muted-foreground">原因 / 记录来路：{row.reason}</p></li>)}</ol>}</section>;
}
