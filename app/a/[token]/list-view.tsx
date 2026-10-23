"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatReportDate } from "@/lib/domains/signals/format";
import { MY_TIERS, pct, SOURCE_LABELS, tiersBeside, type Forecast } from "@/lib/domains/signals/forecast-shared";
import { CONFIDENCE_LEVELS, deadlineLabel, draftVerdict, HORIZONS, MISS_REASONS, type MissReason } from "@/lib/domains/signals/practice-shared";
import { RECALL_LABELS, type RecallResult } from "@/lib/domains/signals/recall-shared";
import type { RecallReveal } from "@/lib/domains/signals/recall";
import type { ExperimentKind } from "@/lib/domains/signals/experiments-shared";
import type { ListConfirm, ListDue, ListExperiment, ListForecast, ListItem, ListPractice, ListRecall } from "@/lib/domains/signals/today-list-shared";
import {
  listConfirmAction,
  listExperimentAction,
  listForecastAction,
  listPracticeAction,
  listRecallRateAction,
  listRecallRevealAction,
  listResolveAction,
  listSkipForecastAction,
} from "./list-actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

type Done = (message: string) => void;
type Result = { ok: true; message: string } | { ok: false; message: string };

/** 每张卡共用：点一下 → 调 action → 成了就收起成一行「记上了」，不成就在卡上说为什么。 */
function useAct(onDone: Done) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<Result>) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await fn();
        if (r.ok) onDone(r.message);
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });
  return { pending, error, act };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null;
}

function Kind({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs text-muted-foreground">{children}</p>;
}

/** 三种思路各说了几成、为什么（折起来，点开才看）。 */
function Views({ views }: { views: { source: Forecast["source"]; probability: number; reason: string | null }[] }) {
  if (views.length === 0) return null;
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground">为什么（三种思路各说了几成）</summary>
      <ul className="mt-1 space-y-1">
        {views.map((v) => (
          <li key={v.source}>
            <span className="font-mono text-muted-foreground">
              {SOURCE_LABELS[v.source]} {pct(v.probability)}
            </span>
            <span className="ml-1">{v.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function PracticeCard({ token, item, onDone }: { token: string; item: ListPractice; onDone: Done }) {
  const { pending, error, act } = useAct(onDone);
  const [override, setOverride] = useState(false);
  const [text, setText] = useState(item.draft ? draftVerdict(item.draft.probability, item.question, true).sentence : "");
  const due = item.deadline ? `到${deadlineLabel(item.deadline)}` : HORIZONS[item.horizon].label;
  return (
    <>
      <Kind>今天的练习</Kind>
      <p className="font-medium leading-7">{item.question}</p>
      {item.mode === "waiting" && <p className="mt-2 text-sm text-muted-foreground">AI 还没判完，7:30 以后再打开这一页就有。</p>}
      {item.mode === "blind" && (
        <div className="mt-2 space-y-2">
          <p className="text-sm leading-7 text-muted-foreground">周一这道先自己判：写一句几个月后说得清对错的话（{due}对账）。</p>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="比如：会，12 月的会议上加到 0.75%。" />
          <Button size="sm" disabled={pending || text.trim().length < 4} onClick={() => act(() => listPracticeAction(token, "blind", text))}>
            {pending ? "在记……" : "写下"}
          </Button>
          <p className="text-xs text-muted-foreground">
            想先拆一拆、看历史上类似的事，
            <Link href="/signals" className="text-primary underline-offset-4 hover:underline">
              去网站上做 →
            </Link>
          </p>
        </div>
      )}
      {item.mode === "draft" && item.draft && (
        <div className="mt-2">
          {(() => {
            const v = draftVerdict(item.draft.probability, item.question);
            return (
              <p className="text-sm">
                <span className="text-muted-foreground">AI：</span>
                <span className="font-medium">{v.will ? "会" : "不会"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {CONFIDENCE_LEVELS[v.confidence].label}（{due}对账）
                </span>
              </p>
            );
          })()}
          <Views views={item.draft.perspectives} />
          {!override ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={pending} onClick={() => act(() => listPracticeAction(token, "agree"))}>
                {pending ? "在记……" : "行"}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setOverride(true)}>
                不行，我觉得{draftVerdict(item.draft.probability, item.question, true).will ? "会" : "不会"}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDone("今天这道不判了。")}>
                跳过
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">句子替你反过来了，后面可以接着写为什么。交了 AI 会挑刺（二三十秒）。</p>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending || text.trim().length < 4} onClick={() => act(() => listPracticeAction(token, "override", text))}>
                  {pending ? "在记、在挑刺……" : "改判，记下"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOverride(false)}>
                  算了，回去
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <ErrorLine error={error} />
    </>
  );
}

function ForecastCard({ token, q, onDone }: { token: string; q: ListForecast; onDone: Done }) {
  const { pending, error, act } = useAct(onDone);
  const [side, setSide] = useState<"higher" | "lower" | null>(null);
  const [note, setNote] = useState("");
  const tier = (p: number, withNote = false) => (
    <Button key={p} size="sm" variant="outline" className="h-8 px-2 font-mono text-xs" disabled={pending} onClick={() => act(() => listForecastAction(token, q.id, p, withNote ? note : ""))}>
      {pct(p)}
    </Button>
  );
  return (
    <>
      <Kind>预测 · {q.resolve_on} 截止</Kind>
      <p className="font-medium leading-7">{q.title}</p>
      {q.criteria && <p className="text-xs leading-6 text-muted-foreground">怎么才算「会」：{q.criteria}</p>}
      {q.blind || q.ai === null ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">这道先自己判，判完再看 AI 的（每周一道）。你觉得「会」的可能有多大？</p>
          <div className="mt-1 flex flex-wrap gap-1">{MY_TIERS.map((p) => tier(p))}</div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm">
            AI：<span className="font-mono">{pct(q.ai)}</span> 会
          </p>
          <Views views={q.three} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => act(() => listForecastAction(token, q.id, "agree"))}>
              行
            </Button>
            {tiersBeside(q.ai, "higher").length > 0 && (
              <Button size="sm" variant={side === "higher" ? "secondary" : "outline"} disabled={pending} onClick={() => setSide(side === "higher" ? null : "higher")}>
                不行，更高
              </Button>
            )}
            {tiersBeside(q.ai, "lower").length > 0 && (
              <Button size="sm" variant={side === "lower" ? "secondary" : "outline"} disabled={pending} onClick={() => setSide(side === "lower" ? null : "lower")}>
                不行，更低
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => listSkipForecastAction(token, q.id))}>
              跳过
            </Button>
          </div>
          {side && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1">{tiersBeside(q.ai, side).map((p) => tier(p, true))}</div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句：你看到了什么 AI 没看到的（可以不写，先写再点档）" maxLength={200} />
            </div>
          )}
        </div>
      )}
      <ErrorLine error={error} />
    </>
  );
}

function ConfirmCard({ token, q, onDone }: { token: string; q: ListConfirm; onDone: Done }) {
  const { pending, error, act } = useAct(onDone);
  const s = q.pending.suggested;
  return (
    <>
      <Kind>到期确认 · {q.resolve_on} 到期</Kind>
      <p className="font-medium leading-7">{q.title}</p>
      {q.criteria && <p className="text-xs leading-6 text-muted-foreground">怎么才算「会」：{q.criteria}</p>}
      <p className="mt-2 text-sm leading-7">
        <span className="text-muted-foreground">程序查到的：</span>
        {s === "yes" ? "看起来「会」" : s === "no" ? "看起来「不会」" : "说不清"} —— {q.pending.note}
      </p>
      {q.pending.evidence.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">原文（{q.pending.evidence.length} 条）</summary>
          <ul className="mt-1 space-y-1">
            {q.pending.evidence.map((e, i) => (
              <li key={i}>
                「{e.excerpt}」
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                  {e.title || "来源"} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {s === "unclear" ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => listConfirmAction(token, q.id, "yes"))}>
              会（发生了）
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => listConfirmAction(token, q.id, "no"))}>
              不会（没发生）
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={pending} onClick={() => act(() => listConfirmAction(token, q.id, s))}>
              按程序的建议（{s === "yes" ? "会" : "不会"}）
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => listConfirmAction(token, q.id, s === "yes" ? "no" : "yes"))}>
              反过来
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => listConfirmAction(token, q.id, "void"))}>
          作废
        </Button>
      </div>
      <ErrorLine error={error} />
    </>
  );
}

function DueCard({ token, j, onDone }: { token: string; j: ListDue; onDone: Done }) {
  const { pending, error, act } = useAct(onDone);
  const [missing, setMissing] = useState(false);
  const ev = j.evidence ?? [];
  const sup = ev.filter((e) => e.stance === "supports").length;
  const con = ev.filter((e) => e.stance === "contradicts").length;
  return (
    <>
      <Kind>到期的判断 · {j.dueAt.slice(0, 10)} 到期</Kind>
      <p className="font-medium leading-7">{j.judgment}</p>
      {j.evidence === null ? (
        <p className="mt-2 text-xs text-muted-foreground">证据还没查好，凭你知道的点。</p>
      ) : ev.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">没查到现在怎样，凭你知道的点。</p>
      ) : (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            查到 {sup} 条支持、{con} 条反对（点开看原文）
          </summary>
          <ul className="mt-1 space-y-1">
            {ev.map((e, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{e.stance === "supports" ? "支持" : e.stance === "contradicts" ? "反对" : "背景"}：</span>
                {e.fact}
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                  {e.title || "来源"} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!missing ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => listResolveAction(token, j.predictionId, "hit"))}>
            看对了
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMissing(true)}>
            看错了
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-muted-foreground">错在哪一步？（可以不选）</p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(MISS_REASONS) as MissReason[]).map((r) => (
              <Button key={r} size="sm" variant="ghost" disabled={pending} onClick={() => act(() => listResolveAction(token, j.predictionId, "miss", r))}>
                {MISS_REASONS[r].split("：")[0]}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => listResolveAction(token, j.predictionId, "miss"))}>
              不选，直接记
            </Button>
          </div>
        </div>
      )}
      <ErrorLine error={error} />
    </>
  );
}

function RecallCard({ token, r, onDone }: { token: string; r: ListRecall; onDone: Done }) {
  const { pending, error, act } = useAct(onDone);
  const [reveal, setReveal] = useState<RecallReveal | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  return (
    <>
      <Kind>回想 · {r.reason}</Kind>
      <p className="font-medium leading-7">{r.title}</p>
      {!reveal ? (
        <>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">先别往下看：当时你为什么在意它？后来怎样了？在心里说一遍。</p>
          <Button
            size="sm"
            className="mt-1"
            disabled={loading}
            onClick={() =>
              startLoading(async () => {
                setRevealError(null);
                try {
                  const x = await listRecallRevealAction(token, r.signalId);
                  if (x.ok) setReveal(x.reveal);
                  else setRevealError(x.message);
                } catch {
                  setRevealError(OFFLINE);
                }
              })
            }
          >
            想好了，看答案
          </Button>
          <ErrorLine error={revealError} />
        </>
      ) : (
        <div className="mt-1 space-y-2 text-sm leading-7">
          <p className="text-muted-foreground">{reveal.note ? `你当时写的：${reveal.note}` : "你当时没写为什么。"}</p>
          {reveal.later.length > 0 ? (
            <ul className="space-y-1">
              <li className="text-xs text-muted-foreground">后来：</li>
              {reveal.later.map((h) => (
                <li key={h.id}>
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
                  {h.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">存档里还没有它后来的消息。</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">刚才你想起来了吗？</span>
            {(Object.keys(RECALL_LABELS) as RecallResult[]).map((x) => (
              <Button key={x} size="sm" variant="outline" disabled={pending} onClick={() => act(() => listRecallRateAction(token, r.signalId, x))}>
                {RECALL_LABELS[x]}
              </Button>
            ))}
          </div>
        </div>
      )}
      <ErrorLine error={error} />
    </>
  );
}

function ExperimentCard({ token, p, onDone }: { token: string; p: ListExperiment; onDone: Done }) {
  const { pending, error, act } = useAct(onDone);
  return (
    <>
      <Kind>你的实验 · 先猜一下 · {p.dueOn} 对账</Kind>
      <p className="font-medium leading-7">{p.question}</p>
      <p className="text-xs text-muted-foreground">{p.label}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {MY_TIERS.map((x) => (
          <Button
            key={x}
            size="sm"
            variant="outline"
            className="h-8 px-2 font-mono text-xs"
            disabled={pending}
            onClick={() => act(() => listExperimentAction(token, { kind: p.kind as ExperimentKind, targetId: p.targetId, platform: p.platform }, x))}
          >
            {pct(x)}
          </Button>
        ))}
      </div>
      <ErrorLine error={error} />
    </>
  );
}

/**
 * 一分钟清单那一页（经用户同意，2026-10-23）：今天要你点的，一件一张卡，点完当场收起成一行「记上了」，不刷新整页。
 * 不用登录（口令认人）；打开只是看，点了按钮才记。这一页是给他一个人的。
 */
export function TodayListView({
  token,
  day,
  items,
  more,
  seconds,
  taps,
}: {
  token: string;
  day: string;
  items: ListItem[];
  more: number;
  seconds: number;
  /** 这周点了几件；没取到为 null。 */
  taps: number | null;
}) {
  const [done, setDone] = useState<Record<number, string>>({});
  const left = items.length - Object.keys(done).length;
  const finish = (i: number) => (message: string) => setDone((d) => ({ ...d, [i]: message }));
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{formatReportDate(day)} · 一分钟清单</p>
        <h1 className="mt-1 text-lg font-semibold leading-8">
          {items.length === 0 ? "今天没有要你点的。" : left === 0 ? "都点完了。" : `今天 ${items.length} 件 · 大约 ${seconds} 秒`}
        </h1>
        {more > 0 && <p className="text-xs text-muted-foreground">还有 {more} 件留到明天。</p>}
      </div>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg border border-border bg-card p-4">
            {done[i] ? (
              <p className="text-sm leading-7 text-primary">{done[i]}</p>
            ) : it.kind === "practice" ? (
              <PracticeCard token={token} item={it} onDone={finish(i)} />
            ) : it.kind === "forecast" ? (
              <ForecastCard token={token} q={it.q} onDone={finish(i)} />
            ) : it.kind === "confirm" ? (
              <ConfirmCard token={token} q={it.q} onDone={finish(i)} />
            ) : it.kind === "due" ? (
              <DueCard token={token} j={it.j} onDone={finish(i)} />
            ) : it.kind === "recall" ? (
              <RecallCard token={token} r={it.r} onDone={finish(i)} />
            ) : (
              <ExperimentCard token={token} p={it.p} onDone={finish(i)} />
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-6 text-muted-foreground">
        {taps !== null ? `这周你点了 ${taps} 件（打开这一页之前的）。` : ""}这一页是给你一个人的，别转发。
      </p>
      <p className="text-sm">
        <Link href="/signals" className="text-primary underline-offset-4 hover:underline">
          回网站看今天的报告 →
        </Link>
      </p>
    </div>
  );
}
