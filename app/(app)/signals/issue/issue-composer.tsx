"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BLOCKER_OPTIONS,
  FIRST_MOVER_OPTIONS,
  issueCounts,
  ISSUE_MAX_PICKS,
  ISSUE_NOTE_MAX,
  ISSUE_PLATFORMS,
  coverUrl,
  STANCE_OPTIONS,
  STANCE_YEARS,
  stanceSentence,
  xIntentUrl,
  type Issue,
  type IssueBet,
  type IssuePlatform,
  type PickStance,
} from "@/lib/domains/signals/issue-shared";
import type { IssueCandidate } from "@/lib/domains/signals/issue";
import { addIssuePublishAction, addIssueResponseAction, composeIssueAction } from "../actions";

const OUTCOME = { pending: "还在等", hit: "对了", miss: "错了" } as const;

function keyOf(c: { side: string; signal_id: string }): string {
  return `${c.side}:${c.signal_id}`;
}

function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "已复制" : label}
    </Button>
  );
}

/** 一排可以点的选项；required 的点了就不能取消，其余点第二下取消。 */
function OptionRow<K extends string>({
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  label: string;
  options: Record<K, string>;
  value: K | undefined;
  onChange: (v: K | undefined) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as K[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={value === k ? "secondary" : "ghost"}
            onClick={() => onChange(value === k && !required ? undefined : k)}
          >
            {options[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}

type PickInput = { stance: Partial<PickStance>; note: string };

function DraftPanel({
  body,
  titles,
  note,
  postToX,
  cover,
}: {
  body: string;
  titles: string[];
  note?: string;
  postToX?: boolean;
  /** 小红书那版带一张封面图（3:4）。 */
  cover?: { src: string; filename: string };
}) {
  return (
    <div className="mt-4 space-y-3">
      {note && <p className="text-xs leading-6 text-muted-foreground">{note}</p>}
      {cover && (
        <div className="flex items-end gap-4">
          <Image
            src={cover.src}
            alt="这一期的封面"
            width={216}
            height={288}
            unoptimized
            className="rounded-md border border-border"
          />
          <Button size="sm" variant="outline" asChild>
            <a href={cover.src} download={cover.filename}>
              下载封面图
            </a>
          </Button>
        </div>
      )}
      {titles.length > 0 && (
        <ul className="space-y-2">
          {titles.map((t) => (
            <li key={t} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{t}</span>
              <CopyButton text={t} label="复制标题" />
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border border-border bg-background p-4 text-sm leading-7 whitespace-pre-wrap">{body}</div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{[...body].length} 字</span>
        <div className="flex gap-2">
          {postToX && (
            <Button size="sm" asChild>
              <a href={xIntentUrl(body)} target="_blank" rel="noopener noreferrer">
                去 X 发这条
              </a>
            </Button>
          )}
          <CopyButton text={body} label="复制正文" />
        </div>
      </div>
    </div>
  );
}

/**
 * 这一期：挑几条、每条写一句自己的判断、挑几条公开对账 → 生成四个版本 → 复制去发 → 记下发在哪、谁回应了。
 */
export function IssueComposer({
  weekStart,
  gaps,
  bets,
  initial,
}: {
  weekStart: string;
  gaps: IssueCandidate[];
  bets: IssueBet[];
  initial: Issue | null;
}) {
  const [picked, setPicked] = useState<Record<string, PickInput>>(
    Object.fromEntries((initial?.content.picks ?? []).map((p) => [keyOf(p), { stance: p.stance ?? {}, note: p.note ?? "" }]))
  );
  const [betIds, setBetIds] = useState<string[]>((initial?.content.bets ?? []).map((b) => b.id));
  const [opening, setOpening] = useState(initial?.content.opening ?? "");
  const [issue, setIssue] = useState<Issue | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [platform, setPlatform] = useState<IssuePlatform>("小红书");
  const [url, setUrl] = useState("");
  const [response, setResponse] = useState("");
  const [wantsTalk, setWantsTalk] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [betNotice, setBetNotice] = useState<string | null>(null);

  const keys = Object.keys(picked);
  const ready = keys.length > 0 && keys.every((k) => !!picked[k].stance.will);
  const update = (k: string, patch: Partial<PickInput>) => setPicked((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  const updateStance = (k: string, patch: Partial<PickStance>) =>
    setPicked((prev) => ({ ...prev, [k]: { ...prev[k], stance: { ...prev[k].stance, ...patch } } }));

  const toggle = (c: IssueCandidate) => {
    const k = keyOf(c);
    setPicked((prev) => {
      if (k in prev) {
        const next = { ...prev };
        delete next[k];
        return next;
      }
      if (Object.keys(prev).length >= ISSUE_MAX_PICKS) return prev;
      return { ...prev, [k]: { stance: {}, note: "" } };
    });
  };

  const compose = () =>
    startTransition(async () => {
      setError(null);
      const result = await composeIssueAction({
        picks: gaps
          .filter((g) => keyOf(g) in picked)
          .map((g) => ({ side: g.side, signal_id: g.signal_id, stance: picked[keyOf(g)].stance, note: picked[keyOf(g)].note })),
        betIds,
        opening,
      });
      if (result.ok) setIssue(result.issue);
      else setError(result.message);
    });

  const counts = issue ? issueCounts(issue) : null;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-base font-semibold">这一期写哪几条（最多 {ISSUE_MAX_PICKS} 条）</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          最近两周清单里的。每条点三下就是你的判断 —— 发出去的就是这句话，别人写不出来的也就是这句话。
          第一问押了「会」或「不会」的，发出去时自动押进判断账本，{STANCE_YEARS} 年后对账。
        </p>
        {gaps.length === 0 ? (
          <p className="mt-3 text-sm leading-7 text-muted-foreground">这两周清单里没有新的。去差距清单扫一轮再来。</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {gaps.map((g) => {
              const k = keyOf(g);
              const on = k in picked;
              return (
                <li key={k} className={"rounded-lg border bg-card p-4 " + (on ? "border-primary" : "border-border")}>
                  <p className="text-xs text-muted-foreground">
                    {g.there}有、{g.here}还没有 · {g.date}
                    {g.arrived ? ` · 重查发现${g.here}这边有了` : ""}
                    {g.hasTransfer ? " · 查过能不能搬过来" : ""}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-7">{g.headline}</p>
                  <p className="text-sm leading-7 text-muted-foreground">{g.hereNow}</p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant={on ? "secondary" : "outline"}
                    disabled={!on && keys.length >= ISSUE_MAX_PICKS}
                    onClick={() => toggle(g)}
                  >
                    {on ? "不写这条" : "写这条"}
                  </Button>
                  {on && (
                    <div className="mt-3 space-y-2">
                      <OptionRow
                        label={`${STANCE_YEARS} 年内${g.here}会不会出现？`}
                        options={STANCE_OPTIONS}
                        value={picked[k].stance.will}
                        onChange={(v) => updateStance(k, { will: v })}
                        required
                      />
                      <OptionRow
                        label="最大的阻碍？"
                        options={BLOCKER_OPTIONS}
                        value={picked[k].stance.blocker}
                        onChange={(v) => updateStance(k, { blocker: v })}
                      />
                      <OptionRow
                        label="谁最可能先做？"
                        options={FIRST_MOVER_OPTIONS}
                        value={picked[k].stance.firstMover}
                        onChange={(v) => updateStance(k, { firstMover: v })}
                      />
                      <Input
                        value={picked[k].note}
                        maxLength={ISSUE_NOTE_MAX}
                        onChange={(e) => update(k, { note: e.target.value })}
                        placeholder="想多说一句？（可以不写）"
                      />
                      {picked[k].stance.will && (
                        <p className="text-sm leading-7">
                          <span className="text-muted-foreground">发出去的是：</span>
                          {stanceSentence(picked[k].stance as PickStance, g.here, picked[k].note)}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">公开对账（可选）</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          最近两周押的、刚对过账的判断。错了也照实写 —— 敢公开对账的人很少，时间长了，这就是别人信你的理由。
        </p>
        {bets.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">最近两周没有押过或对过账的判断。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bets.map((b) => {
              const on = betIds.includes(b.id);
              return (
                <li key={b.id} className="flex items-start justify-between gap-3 text-sm leading-7">
                  <span>
                    {b.judgment}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {b.made_on} 押 · {OUTCOME[b.outcome]}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant={on ? "secondary" : "ghost"}
                    onClick={() => setBetIds((prev) => (on ? prev.filter((id) => id !== b.id) : [...prev, b.id]))}
                  >
                    {on ? "不放了" : "放进去"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">开头一句（可选）</h2>
        <Input
          className="mt-2"
          value={opening}
          maxLength={200}
          onChange={(e) => setOpening(e.target.value)}
          placeholder="这一周你最想说的一句话。不写就由系统按内容写一句简单的开头。"
        />
      </section>

      <div>
        <Button disabled={pending || !ready} onClick={compose}>
          {pending ? "在排版、翻译……二三十秒" : issue?.drafts ? "按现在选的重新生成" : "生成四个版本"}
        </Button>
        {!ready && keys.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">每条都先点一下：{STANCE_YEARS} 年内会不会出现。</p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {issue?.drafts && (
        <section>
          <h2 className="text-base font-semibold">稿子</h2>
          <Tabs defaultValue="zhLong" className="mt-3">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="zhLong">中文长文</TabsTrigger>
              <TabsTrigger value="zhShort">小红书</TabsTrigger>
              <TabsTrigger value="jaLong">日文 note</TabsTrigger>
              <TabsTrigger value="jaShort">日文 X</TabsTrigger>
            </TabsList>
            <TabsContent value="zhLong">
              <DraftPanel body={issue.drafts.zhLong} titles={issue.drafts.zhTitles} note="公众号、即刻用。你的判断是一字不改放进去的（代码核对过）。" />
            </TabsContent>
            <TabsContent value="zhShort">
              <DraftPanel
                body={issue.drafts.zhShort}
                titles={issue.drafts.zhTitles}
                cover={{ src: coverUrl(issue), filename: `周刊-${issue.week_start}.png` }}
                note="小红书正文上限一千字。封面图是 3:4，下载下来当第一张图；后面可以再截清单页的那几条。重新生成稿子后封面也会跟着换。"
              />
            </TabsContent>
            <TabsContent value="jaLong">
              <DraftPanel
                body={issue.drafts.jaLong}
                titles={issue.drafts.jaTitles}
                note="日文是 AI 翻译的，你的判断也是翻译过去的 —— 发之前看一眼语气对不对。"
              />
            </TabsContent>
            <TabsContent value="jaShort">
              <DraftPanel
                body={issue.drafts.jaShort}
                titles={[]}
                postToX
                note="点「去 X 发这条」会打开写好的发帖框，你看一眼再点发布。一条放不下链接，发完在回复里贴 note 的链接。日文是 AI 翻译的。"
              />
            </TabsContent>
          </Tabs>
        </section>
      )}

      {issue && (
        <section className="border-t pt-6">
          <h2 className="text-base font-semibold">发出去以后</h2>
          {counts && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              发了 {counts.published} 处 · 回应 {counts.responses} 条 · 想聊 {counts.wantsTalk} 位
            </p>
          )}

          <div className="mt-4">
            <p className="text-sm">发在了哪</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ISSUE_PLATFORMS.map((p) => (
                <Button key={p} size="sm" variant={platform === p ? "secondary" : "ghost"} onClick={() => setPlatform(p)}>
                  {p}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="链接（可以不填）" />
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setLogError(null);
                    const result = await addIssuePublishAction(issue.id, platform, url);
                    if (result.ok) {
                      setIssue(result.issue);
                      setUrl("");
                      if (result.bets > 0) setBetNotice(`这一期押了「会 / 不会」的 ${result.bets} 条，已经押进判断账本，${STANCE_YEARS} 年后对账。`);
                    } else setLogError(result.message);
                  })
                }
              >
                记下发了
              </Button>
            </div>
            {betNotice && <p className="mt-2 text-sm text-primary">{betNotice}</p>}
            {issue.published.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {issue.published.map((p, i) => (
                  <li key={i}>
                    {p.platform} · {p.at.slice(0, 10)}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                        打开 ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm">有人回应了：把评论或私信贴进来（会记成一条带「读者回应」标签的观察）</p>
            <Textarea className="mt-2" rows={3} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="他说了什么" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant={wantsTalk ? "secondary" : "ghost"} onClick={() => setWantsTalk(!wantsTalk)}>
                {wantsTalk ? "✓ 他想多聊" : "他想多聊？"}
              </Button>
              <Button
                size="sm"
                disabled={pending || response.trim().length < 2}
                onClick={() =>
                  startTransition(async () => {
                    setLogError(null);
                    const result = await addIssueResponseAction(issue.id, weekStart, response, wantsTalk);
                    if (result.ok) {
                      setIssue(result.issue);
                      setResponse("");
                      setWantsTalk(false);
                    } else setLogError(result.message);
                  })
                }
              >
                记下这条回应
              </Button>
            </div>
          </div>
          {logError && <p className="mt-2 text-sm text-destructive">{logError}</p>}
        </section>
      )}
    </div>
  );
}
