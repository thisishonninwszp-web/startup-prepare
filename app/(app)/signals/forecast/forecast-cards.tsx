"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import {
  ANCHOR_LABELS,
  ANCHOR_NOTES,
  KIND_LABELS,
  MODE_LABELS,
  modeOf,
  MY_TIERS,
  pct,
  SOURCE_LABELS,
  tiersBeside,
  type Anchor,
  type Forecast,
  type ForecastQuestion,
} from "@/lib/domains/signals/forecast-shared";
import { applyPlatt, type Platt } from "@/lib/domains/signals/calibration-shared";
import { confirmResolutionAction, revealQuestionAction, setMyForecastAction } from "../memory-actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

function QuestionHead({ q }: { q: ForecastQuestion }) {
  const link = q.kind === "market" ? q.source.url : q.source.signal_id ? `/signals/${q.source.signal_id}` : null;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{q.title}</p>
        <span className="font-mono text-xs text-muted-foreground">
          {KIND_LABELS[q.kind]}
          {q.category ? ` · ${q.category}` : ""} · {q.resolve_on} 截止
        </span>
      </div>
      <p className="text-sm leading-7 text-muted-foreground">怎么才算「会」：{q.criteria}</p>
      {q.kind === "arrival" && q.source.base && <p className="text-xs leading-6 text-muted-foreground">基准（时差图谱）：{q.source.base}</p>}
      {q.kind === "data" && q.context && <p className="text-xs leading-6 text-muted-foreground">{q.context}</p>}
      {link && (
        <p className="text-xs">
          {link.startsWith("/") ? (
            <Link href={link} className="text-primary underline-offset-4 hover:underline">
              {q.kind === "arrival" ? "差距清单里的这一条 →" : "出自这条新闻 →"}
            </Link>
          ) : (
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
              {q.original_title ?? "原题"} ↗
            </a>
          )}
        </p>
      )}
    </>
  );
}

/** AI 的三种思路各说了几成、为什么（折起来，点开才看）。 */
function ThreeViews({ three, summary }: { three: Forecast[]; summary: string }) {
  if (three.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">{summary}</summary>
      <ul className="mt-1 space-y-1">
        {three.map((f) => (
          <li key={f.source}>
            <span className="font-mono text-muted-foreground">
              {SOURCE_LABELS[f.source]} {pct(f.probability)}
            </span>
            <span className="ml-1">{f.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 各方说的几成可能（他判断过或先看过答案以后才显示）。calibration：历史回测学到的 AI 校准（学到了、确实更准才有）。 */
export function Answers({ q, forecasts, calibration }: { q: ForecastQuestion; forecasts: Forecast[]; calibration?: Platt | null }) {
  const of = (s: Forecast["source"]) => forecasts.find((f) => f.question_id === q.id && f.source === s);
  const me = of("me");
  const ai = of("ai");
  const market = of("market");
  const aiText = ai ? `AI ${pct(ai.probability)}${calibration ? `（按回测校准 ${pct(applyPlatt(ai.probability, calibration))}）` : ""}` : "AI 还没判断";
  const parts = [me && `你 ${pct(me.probability)}（${MODE_LABELS[modeOf(me)]}）`, aiText, market && `市场 ${pct(market.probability)}`].filter(Boolean);
  const three = (["ai_outside", "ai_inside", "ai_devil"] as const).map(of).filter((f): f is Forecast => Boolean(f));
  return (
    <div className="mt-2 text-sm leading-7">
      <p className="font-mono">{parts.join(" · ")}</p>
      <ThreeViews three={three} summary="AI 的三种思路各说了几成、为什么" />
    </div>
  );
}

/**
 * 等你判断（经用户明确裁决，2026-10-23：先摆出最准的那个数、你点行不行）。
 * 别的题：摆出那个数（市场题是市场价、政策题和数据题是统计基准、别的是 AI），「行」= 记成这个数，
 * 「不行」在那一边改一档（可以带一句为什么），「跳过」不记；别的几方点完才给看。
 * 每周一道的先判题（或 AI 还没判的）：照旧先点一档、看不到 AI 和市场；也可以先看答案，但看了这道就不能再判断。
 */
export function ForecastCard({ q, blind, anchor, three }: { q: ForecastQuestion; blind: boolean; anchor: Anchor | null; three: Forecast[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<"higher" | "lower" | null>(null);
  const [note, setNote] = useState("");
  const act = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await fn();
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });
  if (!blind && anchor) {
    const higher = tiersBeside(anchor.probability, "higher");
    const lower = tiersBeside(anchor.probability, "lower");
    return (
      <li className="rounded-lg border border-border bg-card p-4">
        <QuestionHead q={q} />
        <p className="mt-3 text-sm">
          {ANCHOR_LABELS[anchor.source]}：<span className="font-mono">{pct(anchor.probability)}</span> 会
        </p>
        <p className="text-xs text-muted-foreground">{ANCHOR_NOTES[anchor.source]}</p>
        <ThreeViews three={three} summary={anchor.source === "ai" ? "为什么（三种思路各说了几成）" : "AI 怎么看（三种思路各说了几成）"} />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => act(() => setMyForecastAction(q.id, "agree"))}>
            行
          </Button>
          {higher.length > 0 && (
            <Button size="sm" variant={side === "higher" ? "secondary" : "outline"} disabled={pending} onClick={() => setSide(side === "higher" ? null : "higher")}>
              不行，更高
            </Button>
          )}
          {lower.length > 0 && (
            <Button size="sm" variant={side === "lower" ? "secondary" : "outline"} disabled={pending} onClick={() => setSide(side === "lower" ? null : "lower")}>
              不行，更低
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => revealQuestionAction(q.id))}>
            跳过
          </Button>
        </div>
        {side && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1">
              {(side === "higher" ? higher : lower).map((p) => (
                <Button key={p} size="sm" variant="outline" className="h-8 px-2 font-mono text-xs" disabled={pending} onClick={() => act(() => setMyForecastAction(q.id, p, note))}>
                  {pct(p)}
                </Button>
              ))}
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句：你看到了什么它没看到的（可以不写，先写再点档）" maxLength={200} />
          </div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">别的几方怎么说，点完再给你看。</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </li>
    );
  }
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <QuestionHead q={q} />
      {blind && <p className="mt-3 text-xs leading-6 text-muted-foreground">这道先自己判，判完再看 AI 的。每周一道，量的是你自己准不准。</p>}
      <p className="mt-3 text-xs text-muted-foreground">到截止日，你觉得「会」的可能有多大？</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {MY_TIERS.map((p) => (
          <Button key={p} size="sm" variant="outline" className="h-8 px-2 font-mono text-xs" disabled={pending} onClick={() => act(() => setMyForecastAction(q.id, p))}>
            {pct(p)}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" disabled={pending} onClick={() => act(() => revealQuestionAction(q.id))}>
        先不判断，直接看 AI 和市场怎么说（看了这道就不能再判断）
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

/** 生意题到期：程序查到的证据和建议，他按证据点会 / 不会 / 作废。 */
export function ConfirmCard({ q, forecasts }: { q: ForecastQuestion; forecasts: Forecast[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = q.pending;
  const confirm = (verdict: "yes" | "no" | "void") =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await confirmResolutionAction(q.id, verdict, note);
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <QuestionHead q={q} />
      <Answers q={q} forecasts={forecasts} />
      {p && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm leading-7">
          <p>
            <span className="text-muted-foreground">程序查到的（{p.checked_on}）：</span>
            {p.suggested === "yes" ? "看起来「会」" : p.suggested === "no" ? "看起来「不会」" : "说不清"} —— {p.note}
          </p>
          {p.evidence.length > 0 && (
            <ul className="mt-1 space-y-1 text-xs">
              {p.evidence.map((e, i) => (
                <li key={i}>
                  「{e.excerpt}」
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                    {e.title || "来源"} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Input className="mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句：你凭什么判（可以不写，用程序那句）" maxLength={200} />
      <div className="mt-2 flex flex-wrap gap-2">
        <ConfirmButton size="sm" variant="outline" disabled={pending} onClick={() => confirm("yes")}>
          会（发生了）
        </ConfirmButton>
        <ConfirmButton size="sm" variant="outline" disabled={pending} onClick={() => confirm("no")}>
          不会（没发生）
        </ConfirmButton>
        <ConfirmButton size="sm" variant="ghost" disabled={pending} onClick={() => confirm("void")}>
          作废（题出得说不清，不算分）
        </ConfirmButton>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}
