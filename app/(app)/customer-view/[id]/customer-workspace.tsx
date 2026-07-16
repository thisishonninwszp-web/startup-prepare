"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  addCustomerMaterial,
  createCustomerProxyVersion,
  createCustomerTopic,
  previewCustomerUrl,
  reviewCustomerMaterial,
  runCustomerIdeaReaction,
  runCustomerResearch,
  saveCustomerConclusion,
  searchCustomerMaterials,
  sendCustomerProxyMessage,
} from "../actions";
import { redactCustomerPii } from "../privacy";
import type { CustomerCaseDetail } from "../queries";
import type {
  CustomerCadence,
  CustomerMaterialOrigin,
  CustomerIdeaReaction,
} from "../types";
import { CustomerProxyView } from "./customer-proxy-view";

const MARKET_LABEL = { cn: "中国", jp: "日本", en: "英语市场" } as const;

type ProxySessionMessage = {
  role: "user" | "assistant";
  content: string;
  evidence_ids?: string[];
  inference?: string;
  unknowns?: string[];
};

export function CustomerWorkspace({
  initialCase,
  ideas,
}: {
  initialCase: CustomerCaseDetail;
  ideas: { id: string; title: string; status: string }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"materials" | "research" | "proxy" | "finish">(
    initialCase.versions.length ? "proxy" : "materials"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialOrigin, setMaterialOrigin] =
    useState<CustomerMaterialOrigin>("interview");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialText, setMaterialText] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [redactedText, setRedactedText] = useState("");
  const [redactions, setRedactions] = useState<string[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState(
    initialCase.versions[0]?.id ?? ""
  );
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ProxySessionMessage[]>(
    (initialCase.versions[0]?.sessions.find(
      (session) => session.mode === "listen"
    )?.messages as ProxySessionMessage[] | undefined) ?? []
  );
  const [reaction, setReaction] = useState<CustomerIdeaReaction | null>(
    (initialCase.versions[0]?.sessions.find(
      (session) => session.mode === "idea_reaction"
    )?.messages?.[1] as CustomerIdeaReaction | undefined) ?? null
  );
  const [ideaId, setIdeaId] = useState(initialCase.idea_id ?? "");
  const [topicQuery, setTopicQuery] = useState(
    `${initialCase.customer_hypothesis} ${initialCase.problem_context}`.slice(
      0,
      300
    )
  );
  const [topicCadence, setTopicCadence] =
    useState<CustomerCadence>("weekly");
  const [conclusion, setConclusion] = useState({
    originalMisunderstanding: initialCase.original_belief,
    updatedUnderstanding: "",
    stillUnknown: "",
    contactPerson: "",
    oneQuestion: "",
  });

  const latestRun = initialCase.runs[0];
  const selectedVersion =
    initialCase.versions.find((version) => version.id === selectedVersionId) ??
    initialCase.versions[0];
  const kept = initialCase.materials.filter((item) => item.status === "kept");
  const candidates = initialCase.materials.filter(
    (item) => item.status === "candidate"
  );
  const atomsForSelected = useMemo(() => {
    if (!selectedVersion) return initialCase.atoms;
    const allowed = new Set(selectedVersion.selected_segment.evidence_ids);
    return initialCase.atoms.filter((atom) => atom.id && allowed.has(atom.id));
  }, [initialCase.atoms, selectedVersion]);

  function selectVersion(versionId: string) {
    setSelectedVersionId(versionId);
    const version = initialCase.versions.find((item) => item.id === versionId);
    setMessages(
      (version?.sessions.find((session) => session.mode === "listen")
        ?.messages as ProxySessionMessage[] | undefined) ?? []
    );
    setReaction(
      (version?.sessions.find((session) => session.mode === "idea_reaction")
        ?.messages?.[1] as CustomerIdeaReaction | undefined) ?? null
    );
  }

  function clearStatus() {
    setError(null);
    setNotice(null);
  }

  async function searchWeb() {
    setBusy("search");
    clearStatus();
    try {
      const result = await searchCustomerMaterials(initialCase.id);
      setNotice(
        `新增或关联 ${result.inserted} 条候选${
          result.errors.length ? `；${result.errors.length} 个市场失败` : ""
        }`
      );
      router.refresh();
    } catch (caught) {
      console.error("搜索顾客材料失败", caught);
      setError(caught instanceof Error ? caught.message : "搜索失败");
    } finally {
      setBusy(null);
    }
  }

  function previewPasted() {
    const result = redactCustomerPii(materialText);
    setRedactedText(result.text);
    setRedactions(result.redactions);
  }

  async function previewUrl() {
    setBusy("url");
    clearStatus();
    try {
      const result = await previewCustomerUrl(materialUrl);
      setMaterialTitle(result.title);
      setRedactedText(result.text);
      setRedactions(result.redactions);
    } catch (caught) {
      console.error("抽取顾客材料URL失败", caught);
      setError(caught instanceof Error ? caught.message : "抽取失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveMaterial() {
    setBusy("material");
    clearStatus();
    try {
      await addCustomerMaterial(initialCase.id, {
        origin: materialOrigin,
        title: materialTitle,
        text: redactedText,
        sourceUrl: materialUrl || undefined,
        market: initialCase.markets[0],
        confirmed: true,
      });
      setMaterialOpen(false);
      setMaterialTitle("");
      setMaterialText("");
      setMaterialUrl("");
      setRedactedText("");
      setNotice("材料已保存并保留，证据将在研究时使用");
      router.refresh();
    } catch (caught) {
      console.error("保存顾客材料失败", caught);
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function review(materialId: string, keep: boolean) {
    setBusy(materialId);
    clearStatus();
    try {
      await reviewCustomerMaterial(
        initialCase.id,
        materialId,
        keep ? "kept" : "excluded"
      );
      router.refresh();
    } catch (caught) {
      console.error("审核顾客材料失败", caught);
      setError(caught instanceof Error ? caught.message : "审核失败");
    } finally {
      setBusy(null);
    }
  }

  async function research() {
    setBusy("research");
    clearStatus();
    try {
      await runCustomerResearch(initialCase.id);
      setTab("research");
      router.refresh();
    } catch (caught) {
      console.error("区分顾客声音失败", caught);
      setError(caught instanceof Error ? caught.message : "研究失败");
    } finally {
      setBusy(null);
    }
  }

  async function selectSegment(key: string) {
    if (!latestRun) return;
    setBusy(key);
    clearStatus();
    try {
      const versionId = await createCustomerProxyVersion(latestRun.id, key);
      setSelectedVersionId(versionId);
      setTab("proxy");
      router.refresh();
    } catch (caught) {
      console.error("建立顾客代理失败", caught);
      setError(caught instanceof Error ? caught.message : "代理生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function sendQuestion() {
    if (!selectedVersion || !question.trim()) return;
    setBusy("chat");
    clearStatus();
    try {
      const next = await sendCustomerProxyMessage(
        selectedVersion.id,
        question
      );
      setMessages(next);
      setQuestion("");
    } catch (caught) {
      console.error("顾客代理回答失败", caught);
      setError(caught instanceof Error ? caught.message : "回答失败");
    } finally {
      setBusy(null);
    }
  }

  async function react() {
    if (!selectedVersion) return;
    setBusy("reaction");
    clearStatus();
    try {
      const next = await runCustomerIdeaReaction(
        selectedVersion.id,
        ideaId || null
      );
      setReaction(next);
      router.refresh();
    } catch (caught) {
      console.error("顾客想法反应失败", caught);
      setError(caught instanceof Error ? caught.message : "反应生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveFinish() {
    if (!selectedVersion) return;
    setBusy("finish");
    clearStatus();
    try {
      await saveCustomerConclusion(selectedVersion.id, conclusion);
      setNotice("理解更新与真实接触问题已保存");
      router.refresh();
    } catch (caught) {
      console.error("保存顾客研究结论失败", caught);
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveTopic() {
    setBusy("topic");
    clearStatus();
    try {
      await createCustomerTopic(initialCase.id, {
        query: topicQuery,
        markets: initialCase.markets,
        cadence: topicCadence,
      });
      setNotice("定期研究主题已创建");
      router.refresh();
    } catch (caught) {
      console.error("创建顾客研究主题失败", caught);
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <header className="border-b bg-card px-4 py-7 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/customer-view"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            返回顾客研究
          </Link>
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                {initialCase.markets.map((market) => (
                  <span
                    key={market}
                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {MARKET_LABEL[market]}
                  </span>
                ))}
                {initialCase.idea_id && (
                  <Link
                    href={`/ideas/${initialCase.idea_id}`}
                    className="rounded-full border px-2 py-0.5 text-[10px]"
                  >
                    已关联想法
                  </Link>
                )}
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
                {initialCase.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                暂定顾客：{initialCase.customer_hypothesis}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 md:max-w-sm">
              <span className="text-muted-foreground">我原先以为：</span>
              {initialCase.original_belief}
            </div>
          </div>
        </div>
      </header>

      <div className="border-b px-4 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto">
          {[
            ["materials", `材料 ${kept.length}/${initialCase.materials.length}`],
            ["research", `顾客声音 ${latestRun ? latestRun.segments.length : 0}`],
            ["proxy", `顾客代理 ${initialCase.versions.length}`],
            ["finish", "理解更新"],
          ].map(([key, label]) => (
            <Button
              key={key}
              type="button"
              onClick={() => setTab(key as typeof tab)}
              className={
                "shrink-0 border-b-2 px-3 py-3 text-xs " +
                (tab === key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground")
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:px-12">
        {error ? (
          <AiErrorNotice error={error} className="mb-6" />
        ) : notice ? (
          <div className="mb-6 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            {notice}
          </div>
        ) : null}

        {tab === "materials" && (
          <div className="space-y-8">
            <section className="grid gap-3 sm:grid-cols-3">
              <Button
                type="button"
                onClick={searchWeb}
                disabled={busy === "search"}
                className="rounded-lg border bg-card p-5 text-left hover:bg-muted/40"
              >
                <Search className="size-4" />
                <div className="mt-4 text-sm font-medium">搜索公开材料</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  按所选市场搜索，结果进入候选收件箱。
                </p>
              </Button>
              <Button
                type="button"
                onClick={() => setMaterialOpen(true)}
                className="rounded-lg border bg-card p-5 text-left hover:bg-muted/40"
              >
                <Plus className="size-4" />
                <div className="mt-4 text-sm font-medium">添加用户材料</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  粘贴访谈、聊天、评论，先自动遮蔽个人信息。
                </p>
              </Button>
              <div className="rounded-lg border bg-card p-5">
                <Sparkles className="size-4" />
                <div className="mt-4 text-sm font-medium">区分顾客声音</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  当前 {kept.length} 份保留材料，3份起取消临时代理。
                </p>
                <Button
                  type="button"
                  onClick={research}
                  disabled={busy === "research" || kept.length === 0}
                  className="mt-3 text-xs underline underline-offset-4"
                >
                  开始研究
                </Button>
              </div>
            </section>

            {materialOpen && (
              <section className="rounded-lg border-2 border-foreground bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">添加并确认遮蔽材料</h2>
                  <Button type="button" onClick={() => setMaterialOpen(false)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select
                    value={materialOrigin}
                    onChange={(event) =>
                      setMaterialOrigin(
                        event.target.value as CustomerMaterialOrigin
                      )
                    }
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="interview">访谈</option>
                    <option value="chat">聊天</option>
                    <option value="review">评论</option>
                    <option value="url">公开URL</option>
                  </select>
                  <input
                    value={materialTitle}
                    onChange={(event) => setMaterialTitle(event.target.value)}
                    placeholder="材料标题"
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                </div>
                {materialOrigin === "url" && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={materialUrl}
                      onChange={(event) => setMaterialUrl(event.target.value)}
                      placeholder="https://..."
                      className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
                    />
                    <Button
                      type="button"
                      onClick={previewUrl}
                      className="rounded-md border px-3 text-xs"
                    >
                      抽取并预览
                    </Button>
                  </div>
                )}
                {materialOrigin !== "url" && (
                  <>
                    <textarea
                      value={materialText}
                      onChange={(event) => setMaterialText(event.target.value)}
                      rows={6}
                      placeholder="粘贴原始材料。点击下方按钮后才会显示遮蔽版本。"
                      className="mt-3 w-full resize-y rounded-md border px-3 py-2 text-sm leading-6"
                    />
                    <Button
                      type="button"
                      onClick={previewPasted}
                      className="mt-2 rounded-md border px-3 py-2 text-xs"
                    >
                      自动遮蔽并预览
                    </Button>
                  </>
                )}
                {redactedText && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>将保存并发送给AI的版本</span>
                      <span>遮蔽：{redactions.join("、") || "无"}</span>
                    </div>
                    <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-5">
                      {redactedText}
                    </pre>
                    <Button
                      type="button"
                      onClick={saveMaterial}
                      disabled={busy === "material"}
                      className="mt-3"
                    >
                      确认并保存遮蔽版本
                    </Button>
                  </div>
                )}
              </section>
            )}

            <section>
              <h2 className="text-sm font-medium">待审候选</h2>
              <div className="mt-3 space-y-3">
                {candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无候选材料。</p>
                ) : (
                  candidates.map((material) => (
                    <MaterialCard
                      key={material.id}
                      material={material}
                      busy={busy === material.id}
                      onReview={review}
                    />
                  ))
                )}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-medium">已保留材料</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {kept.map((material) => (
                  <MaterialCard key={material.id} material={material} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border bg-muted/30 p-5">
              <h2 className="text-sm font-medium">持续收集这个主题</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  value={topicQuery}
                  onChange={(event) => setTopicQuery(event.target.value)}
                  className="rounded-md border bg-card px-3 py-2 text-sm"
                />
                <select
                  value={topicCadence}
                  onChange={(event) =>
                    setTopicCadence(event.target.value as CustomerCadence)
                  }
                  className="rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <option value="weekly">每周</option>
                  <option value="daily">每日</option>
                </select>
                <Button type="button" onClick={saveTopic}>
                  创建主题
                </Button>
              </div>
            </section>
          </div>
        )}

        {tab === "research" && (
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">不同顾客声音</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  选择一种处境与行为，不要把几类人平均成不存在的典型顾客。
                </p>
              </div>
              <Button
                type="button"
                onClick={research}
                className="text-xs underline underline-offset-4"
              >
                用当前证据重新研究
              </Button>
            </div>
            {!latestRun ? (
              <p className="mt-8 text-sm text-muted-foreground">
                先保留材料并运行研究。
              </p>
            ) : (
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {latestRun.segments.map((segment) => (
                  <article
                    key={segment.key}
                    className="flex flex-col rounded-lg border bg-card p-5"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {segment.evidence_ids.length} evidence refs
                    </div>
                    <h3 className="mt-3 text-sm font-medium">{segment.label}</h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {segment.situation}
                    </p>
                    <ul className="mt-4 space-y-1 text-xs leading-5">
                      {segment.behaviors.map((item, index) => (
                        <li key={index}>· {item}</li>
                      ))}
                    </ul>
                    <div className="mt-4 rounded-md bg-muted p-3">
                      <div className="text-[10px] text-muted-foreground">未知</div>
                      {segment.unknowns.map((item, index) => (
                        <p key={index} className="mt-1 text-xs">
                          · {item}
                        </p>
                      ))}
                    </div>
                    <Button
                      type="button"
                      onClick={() => selectSegment(segment.key)}
                      disabled={busy === segment.key}
                      className="mt-5"
                    >
                      用这类声音建立代理
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "proxy" && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="min-w-0">
              {selectedVersion ? (
                <>
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-medium">证据约束顾客代理</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        版本 {selectedVersion.version_no} ·{" "}
                        {new Date(selectedVersion.created_at).toLocaleString(
                          "zh-CN"
                        )}
                      </p>
                    </div>
                    <label className="relative">
                      <select
                        value={selectedVersion.id}
                        onChange={(event) => selectVersion(event.target.value)}
                        className="appearance-none rounded-md border bg-card py-2 pl-3 pr-8 text-xs"
                      >
                        {initialCase.versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            版本 {version.version_no}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3" />
                    </label>
                  </div>
                  <CustomerProxyView
                    proxy={selectedVersion.proxy}
                    delta={selectedVersion.delta}
                    atoms={atomsForSelected}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  先在“顾客声音”中选择一类建立代理。
                </p>
              )}
            </section>

            {selectedVersion && (
              <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
                <section className="rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4" />
                    <h3 className="text-sm font-medium">倾听与追问</h3>
                  </div>
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={
                          "rounded-md p-2 text-xs leading-5 " +
                          (message.role === "assistant"
                            ? "bg-muted"
                            : "ml-5 bg-foreground text-background")
                        }
                      >
                        {message.content}
                        {(message.evidence_ids?.length ?? 0) > 0 && (
                          <div className="mt-1 font-mono text-[9px] opacity-50">
                            {message.evidence_ids?.length ?? 0} refs
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={3}
                    placeholder="问他真正害怕、取舍或继续忍受什么"
                    className="mt-3 w-full resize-y rounded-md border px-2 py-2 text-xs"
                  />
                  <Button
                    type="button"
                    onClick={sendQuestion}
                    disabled={busy === "chat" || !question.trim()}
                    className="mt-2 w-full"
                  >
                    {busy === "chat" ? "回答中…" : "问这个顾客"}
                  </Button>
                </section>

                <section className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-medium">让顾客看你的想法</h3>
                  <select
                    value={ideaId}
                    onChange={(event) => setIdeaId(event.target.value)}
                    className="mt-3 w-full rounded-md border px-2 py-2 text-xs"
                  >
                    <option value="">选择想法</option>
                    {ideas.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={react}
                    disabled={busy === "reaction" || !ideaId}
                    className="mt-2 w-full"
                  >
                    {busy === "reaction" ? "反应中…" : "听拒绝与阻力"}
                  </Button>
                  {reaction && (
                    <div className="mt-4 space-y-3 border-t pt-3 text-xs leading-5">
                      <p className="font-medium">{reaction.first_reaction}</p>
                      <SmallList
                        title="拒绝理由"
                        items={reaction.reasons_to_refuse ?? []}
                      />
                      <SmallList
                        title="信任缺口"
                        items={reaction.trust_gaps ?? []}
                      />
                      <SmallList
                        title="付费阻力"
                        items={reaction.payment_barriers ?? []}
                      />
                    </div>
                  )}
                </section>
              </aside>
            )}
          </div>
        )}

        {tab === "finish" && (
          <section className="mx-auto max-w-2xl">
            <h2 className="text-lg font-medium">把理解带回真实世界</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              代理不是验证。结束时必须留下一个真实接触对象和一个问题。
            </p>
            <div className="mt-6 space-y-5">
              {[
                ["originalMisunderstanding", "我原先误解了什么"],
                ["updatedUnderstanding", "现在我如何理解"],
                ["stillUnknown", "我仍然不知道什么"],
                ["contactPerson", "下一次去找谁"],
                ["oneQuestion", "只问哪一个问题"],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium">{label}</span>
                  <textarea
                    value={conclusion[key as keyof typeof conclusion]}
                    onChange={(event) =>
                      setConclusion((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    rows={key === "oneQuestion" ? 2 : 3}
                    className="mt-2 w-full resize-y rounded-md border bg-card px-3 py-2 text-sm leading-6"
                  />
                </label>
              ))}
              <Button
                type="button"
                onClick={saveFinish}
                disabled={!selectedVersion || busy === "finish"}
              >
                保存理解更新与接触问题
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MaterialCard({
  material,
  busy,
  onReview,
}: {
  material: CustomerCaseDetail["materials"][number];
  busy?: boolean;
  onReview?: (id: string, keep: boolean) => void;
}) {
  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">
            {material.title?.trim() || material.source}
          </h3>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            {material.source} {material.market ? `· ${material.market}` : ""}
          </p>
        </div>
        {material.source_url && (
          <a
            href={material.source_url}
            target="_blank"
            rel="noreferrer"
            aria-label="打开来源"
          >
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
        )}
      </div>
      <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {material.sanitized_text}
      </p>
      {onReview && (
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={() => onReview(material.id, false)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"
          >
            <X className="size-3" /> 排除
          </Button>
          <Button
            type="button"
            onClick={() => onReview(material.id, true)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background"
          >
            <Check className="size-3" /> 保留
          </Button>
        </div>
      )}
    </article>
  );
}

function SmallList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-muted-foreground">{title}</div>
      {items.map((item, index) => (
        <p key={index}>· {item}</p>
      ))}
    </div>
  );
}
