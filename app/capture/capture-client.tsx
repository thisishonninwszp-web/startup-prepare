"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createObservation, generateInquiry } from "./actions";
import { promoteObservationToIdea } from "../ideas/actions";

/** 8 个一键标签（宪法第 3 条：低摩擦，不强制分类，仅辅助）。 */
const TAGS = [
  "客户抱怨",
  "低效流程",
  "付费软件缺陷",
  "手工操作",
  "反复发生",
  "省时间",
  "增收机会",
  "高风险痛点",
] as const;

export type ObservationCard = {
  id: string;
  raw_text: string;
  tags: string[];
  created_at: string;
  /** null = 尚未生成；[] 极少见 */
  questions: string[] | null;
  inquiryLoading: boolean;
  inquiryError?: boolean;
};

export function CaptureClient({
  initial,
  initialText = "",
}: {
  initial: ObservationCard[];
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<ObservationCard[]>(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 快捷键：在页面任意处按 "/" 直接聚焦输入框（低摩擦捕捉）。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function runInquiryFor(id: string, rawText: string) {
    try {
      const questions = await generateInquiry(id, rawText);
      setCards((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, questions, inquiryLoading: false } : c
        )
      );
    } catch {
      setCards((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, inquiryLoading: false, inquiryError: true } : c
        )
      );
    }
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError(null);
    const tags = [...selectedTags];

    try {
      const obs = await createObservation(trimmed, tags);

      // 立即清空，可继续记录下一条（连续记录无阻力）。
      setText("");
      setSelectedTags([]);
      textareaRef.current?.focus();

      const card: ObservationCard = {
        id: obs.id,
        raw_text: obs.raw_text,
        tags: obs.tags,
        created_at: obs.created_at,
        questions: null,
        inquiryLoading: true,
      };
      setCards((prev) => [card, ...prev]);

      // 后台触发 AI 追问，不阻塞下一条记录。
      void runInquiryFor(obs.id, obs.raw_text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 回车保存；Shift+Enter 换行。
    // 中文等输入法组词期间的回车（isComposing）不触发保存，交还给输入法。
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSave();
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 捕捉输入区 */}
      <div className="space-y-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          autoFocus
          placeholder="今天你观察到什么？（不需要是完整的创业想法）"
          className="w-full resize-none rounded-lg border bg-background p-4 text-base outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={
                  "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted")
                }
              >
                #{tag}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            回车保存 · Shift+Enter 换行
          </span>
          <Button onClick={handleSave} disabled={saving || !text.trim()}>
            {saving ? "保存中…" : "记录"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* 今日已记录 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          今天记录的（{cards.length}）
        </h2>
        {cards.length === 0 && (
          <p className="text-sm text-muted-foreground">
            还没有记录。随手写下你今天注意到的一件事。
          </p>
        )}
        {cards.map((card) => (
          <ObservationItem key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

function ObservationItem({ card }: { card: ObservationCard }) {
  const [promoting, setPromoting] = useState(false);
  const [promoted, setPromoted] = useState(false);
  const [promoteError, setPromoteError] = useState(false);

  async function handlePromote() {
    if (promoting || promoted) return;
    setPromoting(true);
    setPromoteError(false);
    try {
      await promoteObservationToIdea(card.id);
      setPromoted(true);
    } catch {
      setPromoteError(true);
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="animate-fade-up rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap text-sm">{card.raw_text}</p>
        {promoted ? (
          <span className="shrink-0 text-xs text-green-600">已提升 ✓</span>
        ) : (
          <button
            type="button"
            onClick={handlePromote}
            disabled={promoting}
            className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {promoting ? "提升中…" : "提升为想法"}
          </button>
        )}
      </div>

      {promoteError && (
        <p className="mt-1 text-xs text-destructive">提升失败，请重试</p>
      )}

      {card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* AI 追问区 */}
      <div className="mt-3 border-t pt-3">
        {card.inquiryLoading && (
          <p className="text-xs text-muted-foreground">AI 正在追问…</p>
        )}
        {card.inquiryError && (
          <p className="text-xs text-destructive">AI 追问失败（不影响记录已保存）</p>
        )}
        {card.questions && card.questions.length > 0 && (
          <ol className="space-y-1.5">
            {card.questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="select-none text-muted-foreground">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
