"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AI_LOCK_MESSAGE,
  AI_ROLES,
  HYPOTHESIS_FIELDS,
  PREDICTION_OUTCOMES,
  SIGNAL_VALUES,
  VERDICTS,
  isAiLocked,
  isPredictionDue,
  type AiRole,
  type ChatTurn,
  type Hypothesis,
  type HypothesisField,
  type Idea,
  type IdeaStatus,
  type DeathMode,
  type LearningLog,
  type Prediction,
  type RealityCheckResult,
  type SignalValue,
  type Validation,
  type Verdict,
} from "../types";
import {
  addValidation,
  createPrediction,
  decide,
  draftSmallestTest,
  resolvePrediction,
  runPreMortem,
  runRealityCheck,
  sendRoleMessage,
  updateHypothesis,
} from "../actions";

const STATUS_COLOR: Record<IdeaStatus, string> = {
  观察: "text-muted-foreground",
  假设: "text-muted-foreground",
  验证中: "text-orange-600",
  MVP候选: "text-green-600",
  归档: "text-red-600",
};

type Fields = Record<HypothesisField, string>;

function initFields(h: Hypothesis): Fields {
  const f = {} as Fields;
  for (const field of HYPOTHESIS_FIELDS) f[field.key] = h[field.key] ?? "";
  return f;
}

export function IdeaDetail({
  idea,
  hypothesis,
  initialChats,
  initialValidations,
  initialPredictions,
}: {
  idea: Idea;
  hypothesis: Hypothesis;
  initialChats: Record<AiRole, ChatTurn[]>;
  initialValidations: Validation[];
  initialPredictions: Prediction[];
}) {
  const [fields, setFields] = useState<Fields>(initFields(hypothesis));
  const [riskiest, setRiskiest] = useState(hypothesis.riskiest_assumption ?? "");
  const [advantage, setAdvantage] = useState(hypothesis.unfair_advantage ?? "");
  const [distribution, setDistribution] = useState(hypothesis.distribution ?? "");
  const [smallestTest, setSmallestTest] = useState(hypothesis.smallest_test ?? "");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // 状态会被决策改变（Go→MVP候选 / Kill→归档），用 state 承载。
  const [status, setStatus] = useState<IdeaStatus>(idea.status);

  // 强制出口机制：last_activity_at 由"记录真实接触"刷新，决定 AI 是否被锁。
  const [lastActivityAt, setLastActivityAt] = useState(idea.last_activity_at);
  const aiLocked = isAiLocked(status, lastActivityAt);

  const complete = HYPOTHESIS_FIELDS.every((f) => fields[f.key].trim());

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      await updateHypothesis(idea.id, {
        ...fields,
        riskiest_assumption: riskiest,
        unfair_advantage: advantage,
        distribution,
        smallest_test: smallestTest,
      });
      setSaveMsg("已保存");
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function draftTest() {
    if (drafting) return;
    setDrafting(true);
    setSaveErr(null);
    try {
      setSmallestTest(await draftSmallestTest(idea.id));
    } catch {
      setSaveErr("AI 草拟失败，请重试（先保存假设再试）");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* 标题 + 状态 */}
      <div>
        <div className="mb-1 text-xs text-muted-foreground">
          状态：<span className={STATUS_COLOR[status]}>{status}</span>
        </div>
        <h1 className="text-xl font-semibold">{idea.title?.trim() || "（无标题）"}</h1>
      </div>

      {/* 假设句式 */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">假设句式</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            填不出空，说明想法还不成立。6 个空全部填满，才能把想法拖进“验证中”。
          </p>
        </div>

        <SentencePreview fields={fields} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HYPOTHESIS_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {f.label}
              </label>
              <input
                value={fields[f.key]}
                onChange={(e) =>
                  setFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ))}
        </div>

        {/* 最关键假设 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            最关键假设
          </label>
          <p className="text-xs text-muted-foreground">
            如果这件事是错的，想法直接死掉——那件事是什么？（只写一条）
          </p>
          <textarea
            value={riskiest}
            onChange={(e) => setRiskiest(e.target.value)}
            rows={2}
            placeholder="写下那一条最致命的假设"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* 创始人-市场匹配：真需求也可能"不该你做" */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            你凭什么是解决这个的人？
          </label>
          <p className="text-xs text-muted-foreground">
            不公平优势 / 渠道 / 专长。答不上来，说明就算是真需求也未必该你做。
          </p>
          <textarea
            value={advantage}
            onChange={(e) => setAdvantage(e.target.value)}
            rows={2}
            placeholder="你比别人更可能赢的具体理由"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* 分发拷问：没分发是头号死法 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            前 10 个真实用户，你具体怎么让他们找到它？
          </label>
          <p className="text-xs text-muted-foreground">
            渠道说不出口 = 方向还不成立。死于“没人知道”的创业，远多于死于“做得不好”。
          </p>
          <textarea
            value={distribution}
            onChange={(e) => setDistribution(e.target.value)}
            rows={2}
            placeholder="具体到去哪、找谁、怎么被看到"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* 最小实验：从判断走向行动 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              测试最关键假设的最小实验（本周做得完的那个）
            </label>
            <button
              type="button"
              onClick={draftTest}
              disabled={drafting}
              className="shrink-0 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
            >
              {drafting ? "草拟中…" : "让 AI 草拟"}
            </button>
          </div>
          <textarea
            value={smallestTest}
            onChange={(e) => setSmallestTest(e.target.value)}
            rows={2}
            placeholder="一个接触真实世界、能证伪最关键假设的具体动作"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存假设"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {complete ? "✓ 6 个空已填满" : "尚有空未填"}
          </span>
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
          {saveErr && <span className="text-xs text-destructive">{saveErr}</span>}
        </div>
      </section>

      {/* 预演死亡 */}
      <PreMortemSection ideaId={idea.id} onUseAsRiskiest={setRiskiest} />

      {/* 现实检验（联网） */}
      <RealityCheckSection ideaId={idea.id} onUseAsRiskiest={setRiskiest} />

      {/* 预测与对账 */}
      <PredictionsSection ideaId={idea.id} initial={initialPredictions} />

      {/* 验证记录 */}
      <ValidationSection
        ideaId={idea.id}
        initial={initialValidations}
        onAdded={() => setLastActivityAt(new Date().toISOString())}
      />

      {/* AI 多角色质疑 */}
      <RoleChallenge
        ideaId={idea.id}
        initialChats={initialChats}
        locked={aiLocked}
      />

      {/* 做决策 */}
      <DecisionSection ideaId={idea.id} onDecided={setStatus} />
    </div>
  );
}

function SentencePreview({ fields }: { fields: Fields }) {
  const v = (k: HypothesisField) => (
    <span className={fields[k].trim() ? "text-foreground" : "text-muted-foreground/50"}>
      {fields[k].trim() || `____`}
    </span>
  );
  return (
    <p className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
      {v("target_user")} 有 {v("pain")}，现在用 {v("alternative")} 解决，但{" "}
      {v("why_insufficient")}，如果有 {v("solution")}，愿意付 {v("willingness_to_pay")}。
    </p>
  );
}

function RoleChallenge({
  ideaId,
  initialChats,
  locked,
}: {
  ideaId: string;
  initialChats: Record<AiRole, ChatTurn[]>;
  locked: boolean;
}) {
  const [active, setActive] = useState<AiRole>(AI_ROLES[0].key);
  const [chats, setChats] = useState<Record<AiRole, ChatTurn[]>>(initialChats);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turns = chats[active] ?? [];

  async function send(message: string | null) {
    if (sending) return;
    setSending(true);
    setError(null);

    // 乐观显示用户消息
    if (message) {
      setChats((prev) => ({
        ...prev,
        [active]: [...(prev[active] ?? []), { role: "user", content: message }],
      }));
      setInput("");
    }

    try {
      const updated = await sendRoleMessage(ideaId, active, message);
      setChats((prev) => ({ ...prev, [active]: updated }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "质疑失败");
      // 回滚乐观消息
      setChats((prev) => ({
        ...prev,
        [active]: (prev[active] ?? []).filter(
          (t) => !(t.role === "user" && t.content === message)
        ),
      }));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (msg) void send(msg);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium">AI 质疑</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          4 个角色只会追问、不会给方案。质疑基于你“已保存”的假设。
        </p>
      </div>

      {/* 强制出口机制：锁定提示 */}
      {locked && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          {AI_LOCK_MESSAGE}
        </div>
      )}

      {/* 角色切换 */}
      <div className="flex flex-wrap gap-2">
        {AI_ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            disabled={locked}
            onClick={() => {
              setActive(r.key);
              setInput("");
              setError(null);
            }}
            className={
              "rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
              (active === r.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-muted")
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 对话 */}
      <div className="min-h-[120px] space-y-3 rounded-lg border p-4">
        {turns.length === 0 && !sending && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              还没有对话。让这个角色开始质疑你的假设。
            </p>
            <Button
              variant="outline"
              onClick={() => void send(null)}
              disabled={sending || locked}
            >
              开始质疑
            </Button>
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm " +
                (t.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted")
              }
            >
              {t.content}
            </div>
          </div>
        ))}

        {sending && <p className="text-xs text-muted-foreground">对方正在追问…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {/* 输入 */}
      {turns.length > 0 && !locked && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="回应这个角色的追问…"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            发送
          </Button>
        </form>
      )}
    </section>
  );
}

const SIGNAL_LABEL: Record<SignalValue, string> = {
  yes: "是",
  no: "否",
  unsure: "不确定",
};

function ValidationSection({
  ideaId,
  initial,
  onAdded,
}: {
  ideaId: string;
  initial: Validation[];
  onAdded: () => void;
}) {
  const [list, setList] = useState<Validation[]>(initial);
  const [open, setOpen] = useState(false);
  const [hasPain, setHasPain] = useState<SignalValue | null>(null);
  const [willPay, setWillPay] = useState<SignalValue | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setHasPain(null);
    setWillPay(null);
    setNote("");
    setError(null);
  }

  async function handleSave() {
    if (saving || !hasPain || !willPay) return;
    setSaving(true);
    setError(null);
    try {
      const v = await addValidation(ideaId, hasPain, willPay, note);
      setList((prev) => [v, ...prev]);
      onAdded(); // 刷新 last_activity_at → 解锁 AI
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">验证记录</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            每一次真实接触，只记两件事：有真实痛？愿付钱？
          </p>
        </div>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            + 记录一次真实接触
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-4 rounded-lg border p-4">
          <TriState
            label="这个人有真实痛？"
            value={hasPain}
            onChange={setHasPain}
          />
          <TriState
            label="这个人愿意付钱？"
            value={willPay}
            onChange={setWillPay}
          />
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              备注（选填）
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="对方现在怎么解决、花了多少钱…"
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || !hasPain || !willPay}>
              {saving ? "保存中…" : "保存"}
            </Button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              取消
            </button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有验证记录。去和一个真实的人聊聊。
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((v) => (
            <li key={v.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap gap-4 text-xs">
                <span>
                  有真实痛：
                  <span className="font-medium text-foreground">
                    {SIGNAL_LABEL[v.has_pain]}
                  </span>
                </span>
                <span>
                  愿付钱：
                  <span className="font-medium text-foreground">
                    {SIGNAL_LABEL[v.will_pay]}
                  </span>
                </span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(v.contacted_at).toLocaleString()}
                </span>
              </div>
              {v.note && (
                <p className="mt-2 whitespace-pre-wrap text-sm">{v.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RealityCheckSection({
  ideaId,
  onUseAsRiskiest,
}: {
  ideaId: string;
  onUseAsRiskiest: (text: string) => void;
}) {
  const [result, setResult] = useState<RealityCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await runRealityCheck(ideaId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "现实检验失败，请重试（先保存假设）"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">现实检验（联网）</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            别在真空里想。联网看真实世界：谁在做、为何死、产业/政策怎么变、最大外部威胁。
          </p>
        </div>
        <Button variant="outline" onClick={run} disabled={loading}>
          {loading ? "联网检验中…" : result ? "重新检验" : "现实检验"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-md border p-3 text-sm">
          <p className="whitespace-pre-wrap">{result.text}</p>
          {result.sources.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2">
              {result.sources.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-full truncate text-xs text-primary underline-offset-4 hover:underline"
                >
                  {s.title || s.url} ↗
                </a>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onUseAsRiskiest(result.text)}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            把这个威胁设为最关键假设
          </button>
        </div>
      )}
    </section>
  );
}

function PreMortemSection({
  ideaId,
  onUseAsRiskiest,
}: {
  ideaId: string;
  onUseAsRiskiest: (text: string) => void;
}) {
  const [modes, setModes] = useState<DeathMode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setModes(await runPreMortem(ideaId));
    } catch {
      setError("预演失败，请重试（先保存假设再试）");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">它最可能怎么死</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            假设它已经失败了。拿你的方向去撞创业最常见的死法，治乐观偏误。
          </p>
        </div>
        <Button variant="outline" onClick={run} disabled={loading}>
          {loading ? "预演中…" : modes ? "重新预演" : "预演死亡"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {modes && modes.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">
          没能得出明确死法。把假设填得更具体再试。
        </p>
      )}

      {modes && modes.length > 0 && (
        <ul className="space-y-2">
          {modes.map((m, i) => (
            <li key={i} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{m.pattern}</span>
                <button
                  type="button"
                  onClick={() => onUseAsRiskiest(`${m.pattern}：${m.why}`)}
                  className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  设为最关键假设
                </button>
              </div>
              {m.why && <p className="mt-1 text-muted-foreground">{m.why}</p>}
              {m.question && <p className="mt-2">{m.question}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PredictionsSection({
  ideaId,
  initial,
}: {
  ideaId: string;
  initial: Prediction[];
}) {
  const [list, setList] = useState<Prediction[]>(initial);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [due, setDue] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const t = text.trim();
    if (!t || saving) return;
    setSaving(true);
    setError(null);
    try {
      const p = await createPrediction(
        ideaId,
        t,
        new Date(due + "T23:59:59").toISOString()
      );
      setList((prev) => [p, ...prev]);
      setText("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">预测与对账</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            验证前写下可证伪的赌注；到期用现实对账，治“我早就知道”。
          </p>
        </div>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            + 写一条预测
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-lg border p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="例：我接触 5 个目标用户，≥3 个会说现在就愿意为此付钱。"
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">对账日</label>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || !text.trim()}>
              {saving ? "保存中…" : "保存预测"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setText("");
                setError(null);
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              取消
            </button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有预测。把“我觉得有人要”变成一个可证伪的赌注。
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((p) => (
            <PredictionRow
              key={p.id}
              p={p}
              onResolved={(np) =>
                setList((prev) => prev.map((x) => (x.id === np.id ? np : x)))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PredictionRow({
  p,
  onResolved,
}: {
  p: Prediction;
  onResolved: (p: Prediction) => void;
}) {
  const [note, setNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const due = isPredictionDue(p);

  async function resolve(outcome: "hit" | "miss") {
    if (resolving) return;
    setResolving(true);
    try {
      onResolved(await resolvePrediction(p.id, outcome, note));
    } catch {
      // 失败保持原样，用户可重试
    } finally {
      setResolving(false);
    }
  }

  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap">{p.text}</p>
        {p.outcome === "hit" && (
          <span className="shrink-0 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
            命中
          </span>
        )}
        {p.outcome === "miss" && (
          <span className="shrink-0 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
            没命中
          </span>
        )}
        {p.outcome === "pending" && (
          <span
            className={
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] " +
              (due
                ? "border-orange-300 bg-orange-50 text-orange-700"
                : "border-border bg-muted text-muted-foreground")
            }
          >
            {due ? "待对账" : "进行中"}
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
        对账日 {new Date(p.due_at).toLocaleDateString()}
      </div>

      {p.outcome === "pending" && due && (
        <div className="mt-2 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="发生了什么（选填）"
            className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            {PREDICTION_OUTCOMES.map((o) => (
              <Button
                key={o.key}
                variant="outline"
                disabled={resolving}
                onClick={() => resolve(o.key)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {p.note && p.outcome !== "pending" && (
        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
          {p.note}
        </p>
      )}
    </li>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SignalValue | null;
  onChange: (v: SignalValue) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        {SIGNAL_VALUES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={
              "rounded-md border px-3 py-1.5 text-sm transition-colors " +
              (value === s.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-muted")
            }
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const EMPTY_LEARNING: LearningLog = {
  original_judgment: "",
  validation_action: "",
  real_result: "",
  learned: "",
};

const LEARNING_FIELDS: { key: keyof LearningLog; label: string; hint: string }[] =
  [
    { key: "original_judgment", label: "原始判断", hint: "当初为何觉得有机会" },
    { key: "validation_action", label: "验证动作", hint: "问了谁、做了什么" },
    { key: "real_result", label: "真实结果", hint: "有痛吗、愿付费吗" },
    { key: "learned", label: "学到什么", hint: "以后如何判断类似机会" },
  ];

function DecisionSection({
  ideaId,
  onDecided,
}: {
  ideaId: string;
  onDecided: (status: IdeaStatus) => void;
}) {
  const [deciding, setDeciding] = useState(false);
  const [done, setDone] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [killOpen, setKillOpen] = useState(false);
  const [learning, setLearning] = useState<LearningLog>(EMPTY_LEARNING);

  async function run(verdict: Verdict, log: LearningLog | null) {
    if (deciding) return;
    setDeciding(true);
    setError(null);
    try {
      const status = await decide(ideaId, verdict, log);
      onDecided(status);
      setDone(verdict);
      setKillOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "决策失败");
    } finally {
      setDeciding(false);
    }
  }

  const killValid = LEARNING_FIELDS.every((f) => learning[f.key].trim());

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">做决策</h2>

      <div className="flex flex-wrap gap-2">
        {VERDICTS.map((v) => (
          <button
            key={v.key}
            type="button"
            disabled={deciding}
            onClick={() => {
              setError(null);
              if (v.key === "Kill") {
                setKillOpen(true);
              } else {
                void run(v.key, null);
              }
            }}
            className="flex flex-col items-start rounded-lg border px-4 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <span className="text-sm font-medium">{v.label}</span>
            <span className="text-xs text-muted-foreground">{v.hint}</span>
          </button>
        ))}
      </div>

      {done === "Pivot" && (
        <p className="text-sm text-muted-foreground">
          已记录 Pivot。回到上方“假设句式”改写你的假设，再继续验证。
        </p>
      )}
      {done && done !== "Pivot" && (
        <p className="text-sm text-green-600">已记录决策：{done}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Kill → Learning Log（界面语言用“学到了什么”，不用“失败/放弃”） */}
      {killOpen && (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">你学到了什么？</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              归档不是失败，是一次有结果的实验。把它变成下次的判断力。
            </p>
          </div>

          {LEARNING_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {f.label}
                <span className="ml-2 font-normal text-muted-foreground/70">
                  {f.hint}
                </span>
              </label>
              <textarea
                value={learning[f.key]}
                onChange={(e) =>
                  setLearning((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                rows={2}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ))}

          <div className="flex items-center gap-3">
            <Button
              onClick={() => void run("Kill", learning)}
              disabled={deciding || !killValid}
            >
              {deciding ? "保存中…" : "保存并归档"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setKillOpen(false);
                setLearning(EMPTY_LEARNING);
                setError(null);
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              取消
            </button>
            {!killValid && (
              <span className="text-xs text-muted-foreground">四项都填写后可归档</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
