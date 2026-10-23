"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { KIND_LABELS, MY_TIERS, pct, SOURCE_LABELS, type Forecast, type ForecastQuestion } from "@/lib/domains/signals/forecast-shared";
import { applyPlatt, type Platt } from "@/lib/domains/signals/calibration-shared";
import { confirmResolutionAction, publishToManifoldAction, revealQuestionAction, setMyForecastAction } from "../memory-actions";

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

/** 各方说的几成可能（他判断过或先看过答案以后才显示）。calibration：历史回测学到的 AI 校准（学到了、确实更准才有）。 */
export function Answers({ q, forecasts, calibration }: { q: ForecastQuestion; forecasts: Forecast[]; calibration?: Platt | null }) {
  const of = (s: Forecast["source"]) => forecasts.find((f) => f.question_id === q.id && f.source === s);
  const me = of("me");
  const ai = of("ai");
  const market = of("market");
  const aiText = ai ? `AI ${pct(ai.probability)}${calibration ? `（按回测校准 ${pct(applyPlatt(ai.probability, calibration))}）` : ""}` : "AI 还没判断";
  const parts = [me && `你 ${pct(me.probability)}`, aiText, market && `市场 ${pct(market.probability)}`].filter(Boolean);
  const three = (["ai_outside", "ai_inside", "ai_devil"] as const).map(of).filter((f): f is Forecast => Boolean(f));
  return (
    <div className="mt-2 text-sm leading-7">
      <p className="font-mono">{parts.join(" · ")}</p>
      {three.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">AI 的三种思路各说了几成、为什么</summary>
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
      )}
    </div>
  );
}

/** 等你判断：先点一档（看不到 AI 和市场的）；也可以先看答案，但看了这道就不能再判断。 */
export function ForecastCard({ q }: { q: ForecastQuestion }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <QuestionHead q={q} />
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

/**
 * 放到 Manifold，让陌生人也来判断（发出去是公开的；出一道花 50 mana，不是真钱）。
 * 放了一周以后取一次大家给的几成，当成「市场」那一方和你、AI 一起记分；这边对完账替你在 Manifold 上结算。
 */
export function PublishManifold({ questionId, url, ready }: { questionId: string; url?: string; ready: boolean }) {
  const [link, setLink] = useState<string | null>(url ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (link) {
    return (
      <p className="mt-1 text-xs">
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
          Manifold 上的这道题 ↗
        </a>
        <span className="ml-2 text-muted-foreground">放了一周以后，大家给的几成会记成「市场」</span>
      </p>
    );
  }
  if (!ready) return <p className="mt-1 text-xs text-muted-foreground">想让陌生人也来判断：在 Vercel 加 MANIFOLD_API_KEY 以后，这里会有「放到 Manifold」。</p>;
  return (
    <div className="mt-1">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const r = await publishToManifoldAction(questionId);
              if (r.ok) setLink(r.url);
              else setError(r.message);
            } catch {
              setError(OFFLINE);
            }
          })
        }
      >
        {pending ? "在译成英文、放上去……" : "放到 Manifold，让陌生人也判断（公开，花 50 mana）"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
