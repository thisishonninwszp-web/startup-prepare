"use client";

import { useEffect, useState, useTransition } from "react";
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
  gapDemand,
  RESPONSE_SIGNALS,
  type ResponseSignal,
  STANCE_OPTIONS,
  STANCE_YEARS,
  stanceSentence,
  withDoorLinks,
  withIssueDoorLink,
  phraseHits,
  type Issue,
  type IssueBet,
  type IssuePlatform,
  type PickStance,
} from "@/lib/domains/signals/issue-shared";
import type { IssueCandidate } from "@/lib/domains/signals/issue";
import { ATLAS_CATEGORIES, baseSentence, type AtlasCategory, type CategoryBase } from "@/lib/domains/signals/atlas-shared";
import { addIssuePublishAction, addIssueResponseAction, composeIssueAction, setPublicRecordAction } from "../actions";
import { OptionRow } from "./option-row";

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

/** category 只在页面上用（点了就显示同一类的先例），不存。 */
type PickInput = { stance: Partial<PickStance>; note: string; category?: AtlasCategory };

function DraftPanel({
  body,
  titles,
  note,
  cover,
}: {
  body: string;
  titles: string[];
  note?: string;
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
          <CopyButton text={body} label="复制正文" />
        </div>
      </div>
    </div>
  );
}

/**
 * 这一期：挑几条、每条写一句自己的判断、挑几条公开对账 → 生成四个版本 → 复制去发 → 记下发在哪、谁回应了。
 */
/** 公开对账页：打开了就给一个随机链接（不用登录能看），关掉旧链接立刻失效。 */
function PublicRecordToggle({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const link = token && typeof window !== "undefined" ? `${window.location.origin}/record/${token}` : "";
  const set = (on: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setPublicRecordAction(on);
      if (result.ok) setToken(result.token);
      else setError(result.message);
    });
  return (
    <section className="border-t pt-6">
      <h2 className="text-base font-semibold">公开对账页</h2>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">
        周刊上押过的每一条、到期对没对，摆在一个不用登录就能看的页面上，错的也留着。贴在主页或笔记里 ——
        陌生人信不信你，看的是你押过的东西应验了几条。只显示周刊上押的那几条，别的一概不显示。
      </p>
      {token ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly value={link} />
            <CopyButton text={link} label="复制链接" />
          </div>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => set(false)}>
            关掉（这个链接立刻失效）
          </Button>
        </div>
      ) : (
        <Button className="mt-3" size="sm" variant="outline" disabled={pending} onClick={() => set(true)}>
          打开公开对账页
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function IssueComposer({
  gaps,
  bets,
  initial,
  publicToken,
  atlasBases,
  doors,
  issueDoors,
  preselect,
}: {
  /** 开着的日文假门（键见 keyOf）：note 版文末放登记页的链接。 */
  doors: Record<string, { token: string; title: string }>;
  /** 周刊付费版的登记页（开着的才有口令）：中文长文、note 版文末各放一句。 */
  issueDoors: { zh: string | null; ja: string | null };
  /** 时差图谱里每一类的基准（图谱还没建为 null）。 */
  atlasBases: Record<AtlasCategory, CategoryBase> | null;
  gaps: IssueCandidate[];
  bets: IssueBet[];
  initial: Issue | null;
  /** 公开对账页的口令（没开为 null，迁移没跑为 "missing-schema"）。 */
  publicToken: string | null | "missing-schema";
  /** 从一条讲透跳过来的那一条：预选上，带着在那一页点的判断。 */
  preselect: { side: string; signal_id: string; stance: Partial<PickStance>; note: string; category?: AtlasCategory } | null;
}) {
  const [picked, setPicked] = useState<Record<string, PickInput>>(() => {
    const base: Record<string, PickInput> = Object.fromEntries(
      (initial?.content.picks ?? []).map((p) => [keyOf(p), { stance: p.stance ?? {}, note: p.note ?? "" }])
    );
    if (preselect && !(keyOf(preselect) in base) && Object.keys(base).length < ISSUE_MAX_PICKS) {
      base[keyOf(preselect)] = { stance: preselect.stance, note: preselect.note, category: preselect.category };
    }
    return base;
  });
  const [betIds, setBetIds] = useState<string[]>((initial?.content.bets ?? []).map((b) => b.id));
  const [opening, setOpening] = useState(initial?.content.opening ?? "");
  const [issue, setIssue] = useState<Issue | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [platform, setPlatform] = useState<IssuePlatform>("小红书");
  // 链接要带网址开头，只有浏览器里知道（服务器那次渲染先不加，免得两边不一样）
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const doorLinks = origin
    ? (issue?.content.picks ?? []).flatMap((p) => {
        const d = doors[keyOf(p)];
        return d ? [{ title: d.title, url: `${origin}/soon/${d.token}` }] : [];
      })
    : [];
  const phrases = (issue?.content.picks ?? []).flatMap((p) => p.searchPhrases ?? []);
  const usedPhrases = issue?.drafts ? phraseHits(issue.drafts.jaTitles, phrases) : [];
  const issueDoorUrl = (lang: "zh" | "ja") => (origin && issueDoors[lang] ? `${origin}/soon/${issueDoors[lang]}` : null);
  const [url, setUrl] = useState("");
  const [response, setResponse] = useState("");
  const [wantsTalk, setWantsTalk] = useState(false);
  const [responsePick, setResponsePick] = useState<number | undefined>(undefined);
  const [responseSignal, setResponseSignal] = useState<ResponseSignal | undefined>(undefined);
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
                  <a
                    href={`/signals/gaps/deep?side=${g.side}&id=${g.signal_id}`}
                    target="_blank"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    一条讲透 ↗
                  </a>
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
                      {atlasBases && g.here === "日本" && (
                        <>
                          <OptionRow
                            label="先看先例：这属于哪一类？"
                            options={ATLAS_CATEGORIES}
                            value={picked[k].category}
                            onChange={(v) => update(k, { category: v })}
                          />
                          {picked[k].category && (
                            <p className="text-sm leading-7 text-muted-foreground">
                              {baseSentence(picked[k].category!, atlasBases[picked[k].category!])}
                              <a href="/signals/atlas" target="_blank" className="ml-1 text-primary underline-offset-4 hover:underline">
                                看是哪几件 ↗
                              </a>
                            </p>
                          )}
                        </>
                      )}
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
          <Tabs defaultValue="xhs" className="mt-3">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="xhs">小红书（{issue.drafts.zhNotes?.length ?? 1} 篇）</TabsTrigger>
              <TabsTrigger value="jaLong">日文 note</TabsTrigger>
              <TabsTrigger value="zhLong">中文长文</TabsTrigger>
            </TabsList>
            <TabsContent value="xhs">
              {issue.drafts.zhNotes ? (
                <div className="space-y-8">
                  <p className="mt-4 text-xs leading-6 text-muted-foreground">
                    一条一篇：小红书上一篇只讲一件事的才有人看。一周发完这几篇，比一次发一篇合集更容易被推出去。
                    每篇的封面下载下来当第一张图；话题标签和结尾问读者的那句已经加好了。
                  </p>
                  {issueDoorUrl("zh") && (
                    <p className="text-xs leading-6 text-muted-foreground">
                      小红书不让放外链：周刊付费版的登记页放主页简介里 —— <span className="break-all font-mono">{issueDoorUrl("zh")}</span>
                    </p>
                  )}
                  {issue.drafts.zhNotes.map((n, i) => {
                    const pick = issue.content.picks[i];
                    const demand = pick ? gapDemand([issue]).get(`${pick.side}:${pick.signal_id}`) : undefined;
                    return (
                    <div key={i} className="border-t pt-4">
                      <p className="font-mono text-xs text-muted-foreground">
                        第 {i + 1} 篇
                        {demand ? ` · 收到：说想要 ${demand.pain} · 问哪里买 ${demand.pay} · 想聊 ${demand.wantsTalk}` : ""}
                      </p>
                      <DraftPanel
                        body={n.body}
                        titles={[n.title]}
                        cover={{ src: coverUrl(issue, i), filename: `周刊-${issue.week_start}-${i + 1}.png` }}
                      />
                    </div>
                    );
                  })}
                </div>
              ) : (
                <DraftPanel
                  body={issue.drafts.zhShort ?? ""}
                  titles={issue.drafts.zhTitles}
                  cover={{ src: coverUrl(issue), filename: `周刊-${issue.week_start}.png` }}
                  note="这是早先生成的合集版。重新生成一次，就会变成一条一篇。"
                />
              )}
            </TabsContent>
            <TabsContent value="jaLong">
              <DraftPanel
                body={withIssueDoorLink(withDoorLinks(issue.drafts.jaLong, doorLinks), issueDoorUrl("ja"), "ja")}
                titles={issue.drafts.jaTitles}
                note={
                  "note 的长文能被 Google 搜到，慢慢积累。日文是 AI 翻译的，你的判断也是翻译过去的 —— 发之前看一眼语气对不对。" +
                  (doorLinks.length > 0
                    ? `文末自动加了 ${doorLinks.length} 条的假门登记页链接（开着的才加，关掉就不加了）。`
                    : "这一期的几条都还没开假门；在差距清单里给某条开了，这里文末会自动加上链接。") +
                  (phrases.length === 0
                    ? "这一期的几条都还没在差距清单里「听一听」，标题没有日本人自己搜的说法可用。"
                    : usedPhrases.length > 0
                      ? `标题用上了日本人自己搜的说法：${usedPhrases.map((q) => `「${q}」`).join("")}。`
                      : `标题没用上日本人自己搜的说法（${phrases.map((q) => `「${q}」`).join("")}），发之前可以自己改一下标题 —— 有这个麻烦的人搜的就是这些词。`)
                }
              />
            </TabsContent>
            <TabsContent value="zhLong">
              <DraftPanel
                body={withIssueDoorLink(issue.drafts.zhLong, issueDoorUrl("zh"), "zh")}
                titles={issue.drafts.zhTitles}
                note={
                  "公众号、即刻用（可选）。你的判断是一字不改放进去的（代码核对过）。" +
                  (issueDoorUrl("zh") ? "文末自动加了周刊付费版的登记页链接。" : "")
                }
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
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              一篇笔记只讲一件事，所以回应就是那件事的需求信号：说想要的记「有痛」，问哪里买、多少钱的记「愿付钱」，会算到差距清单那一条上。
            </p>
            <Textarea className="mt-2" rows={3} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="他说了什么" />
            {issue.content.picks.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-muted-foreground">回的是：</span>
                {issue.content.picks.map((_, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant={responsePick === i ? "secondary" : "ghost"}
                    onClick={() => setResponsePick(responsePick === i ? undefined : i)}
                  >
                    第 {i + 1} 篇
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-muted-foreground">他说的是：</span>
              {(Object.keys(RESPONSE_SIGNALS) as ResponseSignal[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={responseSignal === k ? "secondary" : "ghost"}
                  onClick={() => setResponseSignal(responseSignal === k ? undefined : k)}
                >
                  {RESPONSE_SIGNALS[k]}
                </Button>
              ))}
            </div>
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
                    const result = await addIssueResponseAction(issue.id, response, wantsTalk, responsePick, responseSignal);
                    if (result.ok) {
                      setIssue(result.issue);
                      setResponse("");
                      setWantsTalk(false);
                      setResponsePick(undefined);
                      setResponseSignal(undefined);
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

      {publicToken !== "missing-schema" && <PublicRecordToggle initialToken={publicToken} />}
    </div>
  );
}
