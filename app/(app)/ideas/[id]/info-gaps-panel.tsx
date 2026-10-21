"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  askLinks,
  FOUNDER_FACTS_MAX,
  GAP_STATUS,
  ROUTE_KINDS,
  ROUTE_ORDER,
  UNOBTAINABLE_ADVICE,
  type GapStatus,
  type IdeaFit,
  type InfoGap,
} from "@/lib/domains/ideas/info-gaps-shared";
import { addOwnGapEvidenceAction, countAsksAction, generateIdeaGapsAction, saveFounderFactsAction, setGapStatusAction } from "../info-gap-actions";
import { TrendsChart } from "@/components/trends-chart";
import { AsksView } from "@/components/asks-view";
import type { AsksResult } from "@/lib/domains/signals/asks-shared";

/** 他自己写的约束和优势（只写事实）。所有想法共用一份。 */
function FounderFacts({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <details className="text-sm" open={!initial}>
      <summary className="cursor-pointer text-muted-foreground">你的约束和优势（只写事实，所有想法共用）</summary>
      <div className="mt-2 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={FOUNDER_FACTS_MAX}
          placeholder="例：一个人做，每周能用 15 小时；存款能撑一年；中日双语；住在东京；会写代码、能用 AI 做产品；没做过餐饮；认识的日本公司很少"
        />
        <p className="text-xs leading-6 text-muted-foreground">
          只写事实（钱、时间、在哪、会什么语言、做过什么），不写自我评价（「我擅长沟通」这种不写）。AI 只能照抄这里的原话来说这个想法用上了你哪些优势、碰到了你哪些约束。
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveFounderFactsAction(text);
              setMsg(r.ok ? "存好了。重列一次缺口，就会按这份看是不是你的机会。" : r.message);
            })
          }
        >
          {pending ? "在存……" : "存下"}
        </Button>
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      </div>
    </details>
  );
}

function GapCard({ gap, today }: { gap: InfoGap; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(gap.note ?? "");
  const [own, setOwn] = useState("");
  const [phrase, setPhrase] = useState("");
  const [ownUrl, setOwnUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asks, setAsks] = useState<AsksResult | null>(null);
  const [counting, startCounting] = useTransition();
  const overdue = gap.status === "open" && gap.due_on <= today;
  const routes = [...gap.routes].sort((a, b) => ROUTE_ORDER.indexOf(a.kind) - ROUTE_ORDER.indexOf(b.kind));

  const mark = (status: GapStatus) =>
    startTransition(async () => {
      setError(null);
      const r = await setGapStatusAction(gap.id, status, note);
      if (r.ok) router.refresh();
      else setError(r.message);
    });

  return (
    <li className="rounded-lg border border-border bg-card p-4 text-sm leading-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{gap.question}</p>
        <span className={`font-mono text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
          {GAP_STATUS[gap.status]}
          {gap.status === "open" ? ` · ${overdue ? "该拿了，" : ""}${gap.due_on} 前` : ""}
        </span>
      </div>
      <p>
        <span className="text-muted-foreground">拿到以后：</span>
        {gap.matters}
      </p>
      <p>
        <span className="text-muted-foreground">看到这个就该放弃：</span>
        {gap.disconfirm}
      </p>
      <ol className="mt-2 space-y-1">
        {routes.map((r, i) => (
          <li key={i}>
            <span className="mr-2 font-mono text-xs text-primary">{ROUTE_KINDS[r.kind]}</span>
            {r.how}
          </li>
        ))}
      </ol>

      {gap.evidence.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">补进来的</p>
          <ul className="mt-1 space-y-1">
            {gap.evidence.map((e, i) => (
              <li key={i} className="text-sm">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                    {e.title} ↗
                  </a>
                ) : (
                  e.title
                )}
                {e.note && <span className="ml-1 text-muted-foreground">—— {e.note}</span>}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{e.at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gap.status !== "open" && gap.note && (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">你记的：</span>
          {gap.note}
        </p>
      )}

      {gap.status === "none" && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-muted-foreground">
          {UNOBTAINABLE_ADVICE.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">记一下：拿到了 / 拿不到 / 自己补一条</summary>
        <div className="mt-2 space-y-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="一句：拿到了什么，或者为什么拿不到" maxLength={300} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => mark("got")}>
              拿到了
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => mark("none")}>
              拿不到
            </Button>
            {gap.status !== "open" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark("open")}>
                改回还缺
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="自己补一条：看到了什么" maxLength={300} />
            <Input value={ownUrl} onChange={(e) => setOwnUrl(e.target.value)} placeholder="链接（可以空着）" />
            <Button
              size="sm"
              variant="ghost"
              disabled={pending || !own.trim()}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await addOwnGapEvidenceAction(gap.id, own, ownUrl);
                  if (r.ok) {
                    setOwn("");
                    setOwnUrl("");
                    router.refresh();
                  } else setError(r.message);
                })
              }
            >
              补进去
            </Button>
          </div>
          <div className="space-y-1 border-t pt-2">
            <p className="text-muted-foreground">数一数有多少人在问（不花钱）：写一句普通人会搜的话</p>
            <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="例：家事代行 中国語" maxLength={60} />
            {phrase.trim() && (
              <>
                <p className="flex flex-wrap gap-x-3">
                  {askLinks(phrase).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      {l.label} ↗
                    </a>
                  ))}
                </p>
                <TrendsChart key={phrase.trim()} words={[phrase]} label={`就在这里看「${phrase.trim()}」这五年在 Google 上的搜索走势`} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto min-h-8 whitespace-normal px-2 py-1 text-left text-xs"
                  disabled={counting}
                  onClick={() =>
                    startCounting(async () => {
                      setError(null);
                      const r = await countAsksAction(phrase);
                      if (r.ok) setAsks(r.result);
                      else setError(r.message);
                    })
                  }
                >
                  {counting ? "在数……二三十秒" : `让程序数一数：知恵袋上的提问、人们还会搜什么、国会提过几次`}
                </Button>
              </>
            )}
            {asks && (
              <div className="rounded-md border border-border p-3">
                <AsksView topic={asks.topic} chiebukuro={asks.chiebukuro} asked={asks.asked} kokkai={asks.kokkai} thisYear={Number(asks.checked_at.slice(0, 4))} />
                <p className="mt-2 text-muted-foreground">这些不会自己存下来；有用的数，用上面「自己补一条」记一句。</p>
              </div>
            )}
            <p className="text-muted-foreground">看到的数用上面「自己补一条」记下来（例：知恵袋上「家事代行 中国語」有 120 件问题，近两年的占一半）。</p>
          </div>
          <p className="text-muted-foreground">外部信号里看到有用的，也可以在那条新闻的详情页「补进想法的缺口」。</p>
        </div>
      </details>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}

/**
 * 想法页的信息缺口：继续还是 Kill 还缺哪几样信息，每样写清看到什么就该放弃、去哪拿、几天内拿到；
 * 再看这是不是你的机会（只照抄你自己写的约束和优势）。
 */
export function InfoGapsPanel({
  ideaId,
  initial,
  founderFacts,
  today,
}: {
  ideaId: string;
  initial: { gaps: InfoGap[]; fit: IdeaFit | null } | "missing-schema";
  founderFacts: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (initial === "missing-schema") {
    return (
      <p className="text-sm leading-7 text-muted-foreground">
        还差一步：迁移 088 没跑。执行 supabase/migrations/088_idea_info_gaps.sql 之后再来。
      </p>
    );
  }
  const { gaps, fit } = initial;
  const order: GapStatus[] = ["open", "got", "none"];
  const sorted = [...gaps].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.due_on.localeCompare(b.due_on));

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-muted-foreground">
        信息只有改变一个决定时才有用。这里只列「继续还是 Kill」还缺的那几样 —— 先挑最可能让这个想法死的；每样都写了看到什么就该放弃，专门去找会让你放弃的，不要只找支持的。
        去哪拿按可信度排：找真人 &gt; 已经有人在花钱的痕迹 &gt; 网上的原话 &gt; 外部视角。
      </p>

      <FounderFacts initial={founderFacts} />

      {fit && (fit.uses.length > 0 || fit.hits.length > 0) && (
        <div className="rounded-md border border-border p-3 text-sm leading-7">
          <p className="font-medium">这是不是你的机会</p>
          {fit.uses.length > 0 && (
            <div className="mt-1">
              <p className="text-xs text-muted-foreground">用上了你的</p>
              <ul className="space-y-1">
                {fit.uses.map((u, i) => (
                  <li key={i}>
                    「{u.fact}」<span className="text-muted-foreground">—— {u.how}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fit.hits.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">碰到了你的</p>
              <ul className="space-y-1">
                {fit.hits.map((h, i) => (
                  <li key={i}>
                    「{h.fact}」<span className="text-muted-foreground">—— {h.how}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">只摆出来，不替你下「适不适合」的结论。机会是真的，不等于是你的机会。</p>
        </div>
      )}

      <div>
        <Button
          variant={gaps.length > 0 ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await generateIdeaGapsAction(ideaId);
              if (r.ok) router.refresh();
              else setError(r.message);
            })
          }
        >
          {pending ? "在列……二三十秒" : gaps.length > 0 ? "重列（拿到了的、拿不到的、补进过信息的留着）" : "列出这个想法还缺什么信息"}
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        标了「拿到了」、而且补进过至少一条信息的，算碰到了现实 —— 和记一次真实对话一样，AI 质疑的 3 天重新计时。
      </p>

      {sorted.length > 0 && (
        <ul className="space-y-3">
          {sorted.map((g) => (
            <GapCard key={g.id} gap={g} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}
