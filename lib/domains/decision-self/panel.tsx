"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadDecisionSelfContext, changeDecisionSelfLink, questionDecisionWithSelf } from "./actions";
import { SOURCE_LABELS, sourceKey, type SelfTarget, type SelfSource, type SelfRecord, type SelfContextState, type SelfChallenge } from "./domain";

export function DecisionSelfPanel({ target }: { target: SelfTarget }) {
  const { type, id } = target;
  const [state, setState] = useState<SelfContextState | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [answer, setAnswer] = useState<{ challenge: SelfChallenge; records: SelfRecord[] } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await loadDecisionSelfContext({ type, id });
      if (response.error !== undefined) setError(response.error);
      else setState(response.data);
    } catch { setError("没有连上，请重试读取记录"); }
    finally { setLoading(false); }
  }, [type, id]);
  useEffect(() => { void load(); }, [load]);

  async function toggle(source: SelfSource, selected: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await changeDecisionSelfLink({ type, id }, source, selected);
      if (response.error !== undefined) { setError(response.error); return; }
      setState((previous) => previous && ({ ...previous, links: [
        ...previous.links.filter((link) => sourceKey(link) !== sourceKey(source)),
        ...(selected ? [response.data] : []),
      ] }));
      setAnswer(null);
      setNotice(selected ? "已关联，下次质疑会读取这条记录。" : "已移除，下次质疑不再使用这条记录。历史对话中的内容仍会保留。");
    } catch { setError("没有确认是否保存成功，请刷新记录核对后再试"); }
    finally { setBusy(false); }
  }
  async function question() {
    setBusy(true); setError(""); setAnswer(null); setNotice("");
    try {
      const response = await questionDecisionWithSelf({ type, id });
      if (response.error !== undefined) setError(response.error);
      else setAnswer(response.data);
    } catch { setError("这次质疑没有完成，请重试；已关联的记录仍然保留"); }
    finally { setBusy(false); }
  }
  const selected = new Set(state?.links.map(sourceKey));
  const query = search.trim().toLocaleLowerCase();
  const candidates = state?.records.filter((record) => !selected.has(sourceKey(record)) && `${record.title} ${record.text} ${SOURCE_LABELS[record.type]}`.toLocaleLowerCase().includes(query)) ?? [];

  return <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="decision-self-title">
    <div>
      <h2 id="decision-self-title" className="text-lg font-medium">这件事与我有什么关系</h2>
      <p className="mt-1 text-sm text-muted-foreground">选入相关的经历、技能实践、时间资源或自我假设。AI 只读取你在这里关联的自我记录。</p>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">正在读取你的记录…</p>}
    {!loading && !state && <Button variant="outline" onClick={() => void load()}>重试读取</Button>}
    {state && <>
      <div className="space-y-2">
        {state.links.length === 0 && <p className="text-sm text-muted-foreground">还没有关联。先选一条会影响这次选择的记录。</p>}
        {state.links.map((link) => <div key={sourceKey(link)} className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">{SOURCE_LABELS[link.type]} · {link.record?.date ?? "原记录已无法读取"}</p>
            {link.record ? <details><summary className="cursor-pointer text-sm">{link.record.title}</summary>
              <p className="my-2 whitespace-pre-wrap break-words text-sm">{link.record.text}</p>
              <Link href={link.record.href} className="text-sm underline" target="_blank" rel="noreferrer">查看原记录</Link>
            </details> : <p className="text-sm">这条记录已失效，请移除后再质疑。</p>}
          </div>
          <Button size="sm" variant="ghost" disabled={busy || loading} onClick={() => void toggle(link, false)} aria-label={`移除${link.record?.title ?? "失效记录"}`}>移除</Button>
        </div>)}
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">选择相关记录</summary>
        <div className="mt-3 space-y-3">
          <Input aria-label="搜索自我记录" placeholder="搜索经历、技能或记录里的文字" value={search} onChange={(event) => setSearch(event.target.value)} />
          <p className="text-xs text-muted-foreground">每类列出最近 100 条，较早的已关联记录仍会保留。质疑时请保留最相关的 8 条以内。</p>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {candidates.map((record) => <div key={sourceKey(record)} className="flex items-start justify-between gap-3 border-b py-2">
              <div className="min-w-0"><p className="text-xs text-muted-foreground">{SOURCE_LABELS[record.type]} · {record.date}</p>
                <Link className="break-words text-sm underline" href={record.href} target="_blank" rel="noreferrer">{record.title}</Link>
              </div>
              <Button size="sm" variant="outline" disabled={busy || loading || state.links.length >= 8} onClick={() => void toggle(record, true)} aria-label={`关联${record.title}`}>关联</Button>
            </div>)}
            {candidates.length === 0 && <p className="text-sm text-muted-foreground">这里没有其他匹配记录。可以换个词，或先去<Link href="/self" className="underline">自我</Link>记下一次真实经历。</p>}
          </div>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || loading || !state.links.length || state.links.some((link) => !link.record)} onClick={() => void question()}>{busy ? "正在处理…" : "结合这些记录质疑"}</Button>
        <Button variant="ghost" disabled={busy || loading} onClick={() => { setAnswer(null); void load(); }}>刷新记录</Button>
      </div>
      {answer && <div className="space-y-4 border-t pt-4">
        <p className="text-xs text-muted-foreground">本次质疑及引用原文如下。质疑结果仅在本页保留，刷新后可重新生成。</p>
        {answer.challenge.questions.map((item, index) => <div key={index} className="space-y-2">
          <p className="text-sm font-medium">{item.question}</p>
          <p className="text-sm">什么会改变这个判断：{item.wouldChange}</p>
          {item.sourceIds.map((key) => {
            const record = answer.records.find((record) => sourceKey(record) === key)!;
            return <details key={key} className="text-sm text-muted-foreground">
              <summary className="cursor-pointer">依据：{record.title} · {record.date}</summary>
              <p className="my-2 whitespace-pre-wrap break-words">{record.text}</p>
              <Link className="underline" href={record.href} target="_blank" rel="noreferrer">查看当前原记录</Link>
            </details>;
          })}
        </div>)}
      </div>}
    </>}
  </section>;
}
