"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { saveCanvasDimension, saveCanvasScenario, challengeDimension, polishDraft } from "../actions";
import { DIM_META, USE_CASES, type Dim, type OutreachCanvas, type AiChallenge } from "../types";

const DIMS: Dim[] = ["person", "place", "time", "message"];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function DimCard({
  dim,
  canvasId,
  initialValue,
  initialChallenge,
}: {
  dim: Dim;
  canvasId: string;
  initialValue: string;
  initialChallenge: AiChallenge | undefined;
}) {
  const meta = DIM_META[dim];
  const [value, setValue] = useState(initialValue);
  const [challenge, setChallenge] = useState<AiChallenge | undefined>(initialChallenge);
  const [saving, setSaving] = useState(false);
  const [challenging, setChallenging] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [showChallenge, setShowChallenge] = useState(!!initialChallenge);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setValue(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveCanvasDimension(canvasId, dim, v);
      } catch {
        // silent — user can retry manually
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  async function handleChallenge() {
    if (challenging) return;
    setChallenging(true);
    setChallengeError(null);
    try {
      const feedback = await challengeDimension(canvasId, dim, value);
      setChallenge({
        dim,
        user_snapshot: value,
        feedback,
        created_at: new Date().toISOString(),
      });
      setShowChallenge(true);
    } catch (e) {
      setChallengeError(e instanceof Error ? e.message : "挑战失败");
    } finally {
      setChallenging(false);
    }
  }

  const hasFilled = value.trim().length > 0;
  const hasChallenged = !!challenge;
  const borderClass = hasChallenged
    ? "border-l-2 border-l-status-hypothesis border-t border-r border-b"
    : "border";

  return (
    <div className={`rounded-lg p-4 space-y-3 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.emoji}</span>
          <h3 className="text-sm font-medium">{meta.label}</h3>
          {hasFilled && !hasChallenged && (
            <span className="h-1.5 w-1.5 rounded-full bg-status-validating/40" title="已填写，未挑战" />
          )}
          {hasChallenged && (
            <span className="h-1.5 w-1.5 rounded-full bg-status-hypothesis/40" title="已获得 AI 挑战" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-muted-foreground/50">保存中…</span>
          )}
          <button
            type="button"
            onClick={handleChallenge}
            disabled={challenging || !hasFilled}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {challenging ? "挑战中…" : "AI 挑战"}
          </button>
        </div>
      </div>

      {/* 提示问题 */}
      <ul className="space-y-0.5">
        {meta.prompts.map((p, i) => (
          <li key={i} className="text-xs text-muted-foreground/70">
            · {p}
          </li>
        ))}
      </ul>

      {/* 用户输入 */}
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        placeholder="在这里写下你的思考……"
        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {challengeError && (
        <p className="text-xs text-destructive">{challengeError}</p>
      )}

      {/* AI 挑战结果 */}
      {challenge && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowChallenge((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-status-hypothesis"
          >
            <span>{showChallenge ? "▾" : "▸"}</span>
            AI 挑战
            <span className="text-[10px] font-normal text-muted-foreground">
              {new Date(challenge.created_at).toLocaleDateString("zh-CN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </button>
          {showChallenge && (
            <div className="rounded-md bg-status-hypothesis/10 px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap leading-relaxed">{challenge.feedback}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CanvasWorkspace({ canvas }: { canvas: OutreachCanvas }) {
  const ucInfo = USE_CASES.find((u) => u.key === canvas.use_case);

  const [scenario, setScenario] = useState(canvas.scenario);
  const [draft, setDraft] = useState(canvas.message_draft);
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const scenarioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleScenarioChange(v: string) {
    setScenario(v);
    if (scenarioTimer.current) clearTimeout(scenarioTimer.current);
    scenarioTimer.current = setTimeout(async () => {
      try {
        await saveCanvasScenario(canvas.id, v);
      } catch {
        // silent
      }
    }, 800);
  }

  async function handlePolish() {
    if (polishing) return;
    setPolishing(true);
    setPolishError(null);
    try {
      const result = await polishDraft(canvas.id);
      setDraft(result);
    } catch (e) {
      setPolishError(e instanceof Error ? e.message : "润色失败");
    } finally {
      setPolishing(false);
    }
  }

  function handleDraftChange(v: string) {
    setDraft(v);
    // Save draft via saveCanvasDimension("message")
    saveCanvasDimension(canvas.id, "message", v).catch(() => undefined);
  }

  const challengesByDim = Object.fromEntries(
    canvas.ai_challenges.map((c) => [c.dim, c])
  ) as Partial<Record<Dim, AiChallenge>>;

  const dimValues: Record<Dim, string> = {
    person: canvas.person_notes,
    place: canvas.place_notes,
    time: canvas.time_notes,
    message: canvas.message_draft,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Link href="/outreach" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{canvas.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ucInfo?.label ?? canvas.use_case}
          </p>
        </div>
      </div>

      {/* 场景描述 */}
      <div className="mb-8 space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          目标描述
        </label>
        <textarea
          value={scenario}
          onChange={(e) => handleScenarioChange(e.target.value)}
          rows={2}
          placeholder="我想说服 ___，让他们 ___。背景是 ___。"
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* 四维画布 */}
      <div className="mb-8 space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          四维规划
        </h2>
        <p className="text-xs text-muted-foreground">
          每个维度自己写，AI 找漏洞——不是替你想，是逼你想得更清楚。
        </p>
        {DIMS.filter((d) => d !== "message").map((dim) => (
          <DimCard
            key={dim}
            dim={dim}
            canvasId={canvas.id}
            initialValue={dimValues[dim]}
            initialChallenge={challengesByDim[dim]}
          />
        ))}
      </div>

      {/* 消息草稿 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            消息草稿
          </h2>
          <div className="flex items-center gap-2">
            {draft && <CopyButton text={draft} />}
            <button
              type="button"
              onClick={handlePolish}
              disabled={polishing}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
            >
              {polishing ? "润色中…" : draft ? "AI 润色" : "AI 生成草稿"}
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          先自己写一版——开头描述对方的困境（不是介绍自己），结尾提一个低承诺的下一步。
        </p>

        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground/70">
            · 对的人（你想联系谁）
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            · 开场白（共鸣对方痛苦，不是推销）
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            · 低承诺下一步（「方便 15 分钟聊吗？」）
          </p>
        </div>

        <textarea
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          rows={7}
          placeholder="先自己写……"
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {polishError && <p className="text-xs text-destructive">{polishError}</p>}
      </div>
    </div>
  );
}
