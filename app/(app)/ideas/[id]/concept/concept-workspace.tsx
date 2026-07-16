"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  addCompanyFact,
  archiveCompanyFact,
  confirmConceptVersion,
  createConceptVersion,
  generateConceptDerivatives,
  generateConceptDraft,
  recordConceptComprehension,
  saveConceptSelections,
} from "@/lib/domains/concepts/actions";
import type { ConceptWorkspaceDetail } from "@/lib/domains/concepts/queries";
import type {
  ConceptCandidate,
  ConceptStoryType,
} from "@/lib/domains/concepts/types";

const STORY_LABELS: Record<ConceptStoryType, string> = {
  insight: "洞察型",
  vision: "愿景型",
  integrated: "融合型",
};

type Draft = {
  central_question: { type: string; question: string };
  insight_story: ConceptWorkspaceDetail["versions"][number]["insight_story"];
  vision_story: ConceptWorkspaceDetail["versions"][number]["vision_story"];
  benefit_chain: ConceptWorkspaceDetail["versions"][number]["benefit_chain"];
  candidates: ConceptCandidate[];
  customer_material_ids: string[];
  has_customer_conclusion: boolean;
  company_fact_ids: string[];
  pending_selected_concept?: ConceptCandidate;
  pending_personal_resonance?: boolean | null;
  pending_change_reason?: string;
};

export function ConceptWorkspace({
  detail,
}: {
  detail: ConceptWorkspaceDetail;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const workspace = detail.workspace;
  const draft = workspace?.draft as Draft | null;
  const [customerId, setCustomerId] = useState(
    workspace?.customer_proxy_version_id ?? ""
  );
  const [dreamId, setDreamId] = useState(workspace?.dream_version_id ?? "");
  const [reframingId, setReframingId] = useState(
    workspace?.reframing_session_id ?? ""
  );
  const [fermiId, setFermiId] = useState(
    workspace?.fermi_estimate_id ?? ""
  );
  const [bayesId, setBayesId] = useState(
    workspace?.bayesian_belief_id ?? ""
  );
  const [storyType, setStoryType] = useState<ConceptStoryType>(
    workspace?.story_type ?? "integrated"
  );
  const [fact, setFact] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editedCandidate, setEditedCandidate] =
    useState<ConceptCandidate | null>(
      draft?.pending_selected_concept ?? null
    );
  const [resonance, setResonance] = useState<"" | "yes" | "no">(
    draft?.pending_personal_resonance === true
      ? "yes"
      : draft?.pending_personal_resonance === false
        ? "no"
        : ""
  );
  const [changeReason, setChangeReason] = useState(
    draft?.pending_change_reason ?? ""
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCandidate =
    editedCandidate ?? draft?.candidates[selectedIndex] ?? null;
  const latestVersion = detail.versions[0] ?? null;
  const customerChoice = detail.customerChoices.find(
    (item) => item.id === customerId
  );
  const gates = useMemo(
    () => [
      {
        label: "Valuable · 顾客证据",
        met:
          (draft?.customer_material_ids.length ??
            customerChoice?.kept_count ??
            0) >= 3 &&
          (draft?.has_customer_conclusion ??
            customerChoice?.has_conclusion ??
            false),
        note: "至少3份独立保留材料与一份研究结论",
      },
      {
        label: "Original · 事实与竞争缺口",
        met:
          (draft?.company_fact_ids.length ?? detail.facts.length) > 0 &&
          Boolean(draft?.insight_story?.overlooked_gap),
        note: "至少一条用户记录的公司事实，且顾客证据显示现有方案遗漏",
      },
      {
        label: "Scalable · 费米区间",
        met: Boolean(fermiId),
        note: "缺失不阻止确认",
      },
      {
        label: "Simple · 真人复述",
        met: Boolean(
          latestVersion?.comprehension_tests.some(
            (test) => test.captured_core === true
          )
        ),
        note: "真人能否复述核心；保存原话并记录是／否",
      },
      {
        label: "体温 · 自己是否愿意承担",
        met: resonance !== "" || latestVersion?.personal_resonance !== null,
        note: "只代表你的感受，不证明顾客需求",
      },
    ],
    [
      customerChoice,
      detail.facts.length,
      draft,
      fermiId,
      latestVersion,
      resonance,
    ]
  );

  function run(
    action: () => Promise<unknown>,
    success: string,
    clear?: () => void
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        clear?.();
        setMessage(success);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败");
      }
    });
  }

  function saveSources() {
    run(
      () =>
        saveConceptSelections(detail.idea.id, {
          customerProxyVersionId: customerId || null,
          dreamVersionId: dreamId || null,
          reframingSessionId: reframingId,
          fermiEstimateId: fermiId || null,
          bayesianBeliefId: bayesId || null,
          storyType,
        }),
      "来源已保存。来源更新不会改写旧版本。"
    );
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-border pb-6">
        <Link
          href={`/ideas/${detail.idea.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 返回想法
        </Link>
        <p className="mt-6 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Value Blueprint
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {detail.idea.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          把顾客证据、梦想愿景与公司事实收敛为一个可用于取舍的价值设计图。这里不评价想法，只暴露证据缺口。
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4 rounded-lg border border-border p-5">
          <div>
            <h2 className="font-medium">1. 选择来源</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              新来源只进入下一次草稿和新版本。
            </p>
          </div>
          <SourceSelect
            label="顾客代理版本"
            value={customerId}
            onChange={setCustomerId}
            optional={storyType === "vision"}
            options={detail.customerChoices.map((item) => ({
              value: item.id,
              label: `${item.case_title} · v${item.version_no} · ${item.kept_count}份材料`,
            }))}
          />
          <SourceSelect
            label="梦想版本"
            value={dreamId}
            onChange={setDreamId}
            optional={storyType === "insight"}
            options={detail.dreamChoices.map((item) => ({
              value: item.id,
              label: `${item.case_title} · ${item.branch_name} · v${item.version_no}${
                item.is_focused ? " · 当前焦点" : ""
              }`,
            }))}
          />
          <SourceSelect
            label="已收敛 Central Question"
            value={reframingId}
            onChange={setReframingId}
            options={detail.reframingChoices.map((item) => ({
              value: item.id,
              label: item.selected_question,
            }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SourceSelect
              label="费米估算（可选）"
              value={fermiId}
              onChange={setFermiId}
              optional
              options={detail.fermiChoices.map((item) => ({
                value: item.id,
                label: item.question,
              }))}
            />
            <SourceSelect
              label="贝叶斯信念（可选）"
              value={bayesId}
              onChange={setBayesId}
              optional
              options={detail.bayesChoices.map((item) => ({
                value: item.id,
                label: item.question,
              }))}
            />
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">故事类型</span>
            <select
              value={storyType}
              onChange={(event) =>
                setStoryType(event.target.value as ConceptStoryType)
              }
              className="w-full rounded-md border border-border bg-white px-3 py-2"
            >
              {Object.entries(STORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={saveSources}
            disabled={pending || !reframingId}
          >
            保存来源
          </Button>
        </div>

        <aside className="rounded-lg bg-foreground p-5 text-background">
          <h2 className="text-sm font-medium">VOSS 证据状态</h2>
          <div className="mt-4 space-y-4">
            {gates.map((gate) => (
              <div key={gate.label}>
                <p className="text-sm">
                  <span
                    className={
                      gate.met ? "text-status-mvp/80" : "text-status-validating/80"
                    }
                  >
                    {gate.met ? "已具备" : "缺口"}
                  </span>
                  {" · "}
                  {gate.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                  {gate.note}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="rounded-lg border border-border p-5">
        <h2 className="font-medium">2. 公司事实</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          只写可核对的事实。AI不能替你发明独特性。
        </p>
        <div className="mt-4 flex gap-2">
          <input
            value={fact}
            onChange={(event) => setFact(event.target.value)}
            placeholder="例如：我们已连续访谈这一类顾客12个月"
            className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <Button
            variant="outline"
            disabled={pending || !fact.trim()}
            onClick={() =>
              run(
                () => addCompanyFact(detail.idea.id, fact),
                "公司事实已保存",
                () => setFact("")
              )
            }
          >
            添加
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {detail.facts.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-4 rounded-md bg-muted/50 px-3 py-2 text-sm"
            >
              <span>{item.fact}</span>
              <button
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  run(
                    () => archiveCompanyFact(detail.idea.id, item.id),
                    "公司事实已归档"
                  )
                }
              >
                归档
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">3. 生成价值设计草稿</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              AI只能使用已选择并验证归属的来源。
            </p>
          </div>
          <Button
            disabled={pending || !workspace}
            onClick={() =>
              run(
                () => generateConceptDraft(detail.idea.id),
                "已生成新草稿"
              )
            }
          >
            生成草稿
          </Button>
        </div>

        {draft ? (
          <div className="mt-6 space-y-6">
            <div className="border-l-2 border-foreground pl-4">
              <p className="text-xs text-muted-foreground">Central Question</p>
              <p className="mt-1 font-medium">
                {draft.central_question.question}
              </p>
            </div>
            {draft.insight_story ? (
              <div>
                <h3 className="text-sm font-medium">顾客矛盾与遗漏</h3>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  想要「{draft.insight_story.conflict.desire_a}」，但又想「
                  {draft.insight_story.conflict.desire_b}」
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  现有方案遗漏：{draft.insight_story.overlooked_gap}
                </p>
                <Competitors story={draft.insight_story} />
              </div>
            ) : null}
            {draft.vision_story ? (
              <div>
                <h3 className="text-sm font-medium">愿景变化</h3>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {draft.vision_story.current_world} →{" "}
                  {draft.vision_story.future_world}
                </p>
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-medium">
                公司事实 → 一般好处 → 顾客独特收益
              </h3>
              <div className="mt-2 space-y-2">
                {draft.benefit_chain.map((chain) => (
                  <p
                    key={chain.fact_id}
                    className="rounded-md bg-muted/50 p-3 text-sm leading-6"
                  >
                    {chain.fact} → {chain.general_benefit} →{" "}
                    {chain.customer_benefit}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium">一行概念候选</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {draft.candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.one_line}-${index}`}
                    onClick={() => {
                      setSelectedIndex(index);
                      setEditedCandidate(null);
                    }}
                    className={`rounded-lg border p-4 text-left ${
                      selectedIndex === index
                        ? "border-foreground bg-foreground text-primary-foreground"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <span className="text-xs opacity-60">
                      {STORY_LABELS[candidate.story_type]}
                    </span>
                    <p className="mt-2 text-sm font-medium leading-6">
                      {candidate.one_line}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            {selectedCandidate ? (
              <CandidateEditor
                candidate={selectedCandidate}
                onChange={setEditedCandidate}
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">这句话让你的体温升高吗？</span>
                <select
                  value={resonance}
                  onChange={(event) =>
                    setResonance(event.target.value as "" | "yes" | "no")
                  }
                  className="w-full rounded-md border border-border bg-white px-3 py-2"
                >
                  <option value="">未记录</option>
                  <option value="yes">是</option>
                  <option value="no">否</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">与上一版相比为何改变</span>
                <input
                  value={changeReason}
                  onChange={(event) => setChangeReason(event.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
            </div>
            <Button
              disabled={pending || !selectedCandidate}
              onClick={() =>
                selectedCandidate &&
                run(
                  () =>
                    createConceptVersion(
                      detail.idea.id,
                      selectedCandidate,
                      resonance === "" ? null : resonance === "yes",
                      changeReason
                    ),
                  "已创建不可覆盖的新版本"
                )
              }
            >
              保存为新版本
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            先保存来源，再生成第一份草稿。
          </p>
        )}
      </section>

      <VersionHistory
        detail={detail}
        pending={pending}
        run={run}
      />

      {message ? (
        <p className="rounded-md bg-status-mvp/10 px-4 py-3 text-sm text-status-mvp">
          {message}
        </p>
      ) : null}
      <AiErrorNotice error={error} />
    </div>
  );
}

function SourceSelect({
  label,
  value,
  onChange,
  options,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  optional?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-white px-3 py-2"
      >
        <option value="">{optional ? "不引用" : "请选择"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Competitors({
  story,
}: {
  story: NonNullable<Draft["insight_story"]>;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {(
        [
          ["时间替代", story.competitors.time],
          ["Job替代", story.competitors.job],
          ["品类替代", story.competitors.category],
        ] as const
      ).map(([label, items]) => (
        <div key={label} className="rounded-md border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {items.length ? (
            items.map((item) => (
              <p key={`${item.name}-${item.weakness}`} className="mt-2 text-xs">
                {item.name}：{item.weakness}
              </p>
            ))
          ) : (
            <p className="mt-2 text-xs text-muted-foreground/80">证据中未知</p>
          )}
        </div>
      ))}
    </div>
  );
}

function CandidateEditor({
  candidate,
  onChange,
}: {
  candidate: ConceptCandidate;
  onChange: (candidate: ConceptCandidate) => void;
}) {
  const fields: Array<[keyof ConceptCandidate, string]> = [
    ["one_line", "最终一行概念"],
    ["serves_whom", "服务谁"],
    ["change", "创造什么变化"],
    ["difference", "凭什么不同"],
    ["give_up", "主动放弃什么"],
  ];
  return (
    <div className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
      {fields.map(([key, label]) => (
        <label
          key={key}
          className={`space-y-1 text-sm ${
            key === "one_line" ? "sm:col-span-2" : ""
          }`}
        >
          <span className="text-muted-foreground">{label}</span>
          <textarea
            value={candidate[key] as string}
            onChange={(event) =>
              onChange({ ...candidate, [key]: event.target.value })
            }
            rows={key === "one_line" ? 2 : 3}
            className="w-full resize-y rounded-md border border-border bg-white px-3 py-2"
          />
        </label>
      ))}
    </div>
  );
}

function VersionHistory({
  detail,
  pending,
  run,
}: {
  detail: ConceptWorkspaceDetail;
  pending: boolean;
  run: (
    action: () => Promise<unknown>,
    success: string,
    clear?: () => void
  ) => void;
}) {
  const [repeatedWords, setRepeatedWords] = useState("");
  const [capturedCore, setCapturedCore] = useState<"yes" | "no">("yes");
  if (!detail.versions.length) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-medium">版本历史</h2>
      {detail.versions.map((version) => (
        <article
          key={version.id}
          className="rounded-lg border border-border p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                v{version.version_no} ·{" "}
                {version.status === "confirmed" ? "已确认" : "临时"}
              </p>
              <h3 className="mt-2 text-lg font-medium">
                {version.selected_concept.one_line}
              </h3>
            </div>
            {version.status === "provisional" ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      confirmConceptVersion(detail.idea.id, version.id),
                    "产品概念已确认"
                  )
                }
              >
                确认产品概念
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      generateConceptDerivatives(
                        detail.idea.id,
                        version.id
                      ),
                    "已生成新一版落地页概念与行动价值观"
                  )
                }
              >
                生成派生内容
              </Button>
            )}
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">服务谁</dt>
              <dd className="mt-1">{version.selected_concept.serves_whom}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">创造的变化</dt>
              <dd className="mt-1">{version.selected_concept.change}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">凭什么不同</dt>
              <dd className="mt-1">{version.selected_concept.difference}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">主动放弃</dt>
              <dd className="mt-1">{version.selected_concept.give_up}</dd>
            </div>
          </dl>

          {version.evidence_gaps.length ? (
            <div className="mt-4 rounded-md bg-status-validating/10 p-3">
              <p className="text-xs font-medium text-status-validating">证据缺口</p>
              <ul className="mt-2 space-y-1 text-xs text-status-validating">
                {version.evidence_gaps.map((gap) => (
                  <li key={gap}>— {gap}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {version.delta ? (
            <details className="mt-4 rounded-md border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-foreground">
                与上一版的差异
              </summary>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                {[
                  ["新增支持", version.delta.supported],
                  ["被推翻", version.delta.overturned],
                  ["愿景变化", version.delta.changed_vision],
                  ["独特性变化", version.delta.changed_difference],
                  ["主动放弃变化", version.delta.changed_give_up],
                  ["新增缺口", version.delta.new_gaps],
                ].map(([label, items]) => (
                  <div key={label as string}>
                    <p className="font-medium text-muted-foreground">
                      {label as string}
                    </p>
                    {(items as string[]).length ? (
                      (items as string[]).map((item) => (
                        <p key={item} className="mt-1">
                          — {item}
                        </p>
                      ))
                    ) : (
                      <p className="mt-1 text-muted-foreground/80">没有记录</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm font-medium">真人复述</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={repeatedWords}
                onChange={(event) => setRepeatedWords(event.target.value)}
                placeholder="对方复述的原话"
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
              <select
                value={capturedCore}
                onChange={(event) =>
                  setCapturedCore(event.target.value as "yes" | "no")
                }
                className="rounded-md border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="yes">抓住核心</option>
                <option value="no">没有抓住</option>
              </select>
              <Button
                variant="outline"
                disabled={pending || !repeatedWords.trim()}
                onClick={() =>
                  run(
                    () =>
                      recordConceptComprehension(
                        detail.idea.id,
                        version.id,
                        repeatedWords,
                        capturedCore === "yes"
                      ),
                    "真人复述已记录",
                    () => setRepeatedWords("")
                  )
                }
              >
                保存
              </Button>
            </div>
          </div>

          {version.derivatives.map((derivative) => (
            <div
              key={derivative.id as string}
              className="mt-5 border-t border-border pt-4"
            >
              <p className="text-xs text-muted-foreground">
                派生版本 v{derivative.version_no as number}
              </p>
              <h4 className="mt-2 text-lg font-medium">
                {derivative.landing_page.headline}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {derivative.landing_page.subheadline}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {derivative.landing_page.reasons_to_believe.map((reason) => (
                  <li key={reason.text}>— {reason.text}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm font-medium">
                CTA：{derivative.landing_page.cta}
              </p>
              <div className="mt-4 space-y-2">
                {derivative.action_values.values.map((value) => (
                  <div key={value.statement} className="rounded-md bg-muted/50 p-3">
                    <p className="text-sm font-medium">{value.statement}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      代价：{value.cost} · 反例：{value.counterexample}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
