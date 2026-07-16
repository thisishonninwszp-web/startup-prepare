"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createCouncilSession, createCustomPersona } from "@/app/(app)/council/actions";
import type { CouncilPersona } from "@/app/(app)/council/types";

export function NewCouncilForm({
  ideaId,
  personas,
}: {
  ideaId: string | null;
  personas: CouncilPersona[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [personaList, setPersonaList] = useState(personas);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customGrounding, setCustomGrounding] = useState("");
  const [customPending, startCustomTransition] = useTransition();
  const [customError, setCustomError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleAddCustomPersona() {
    setCustomError(null);
    startCustomTransition(async () => {
      try {
        const result = await createCustomPersona({
          displayName: customName,
          groundingNote: customGrounding,
        });
        setPersonaList((current) => [
          ...current,
          {
            key: result.key,
            display_name: customName.trim(),
            is_builtin: false,
            category: "自定义",
            grounding_note: customGrounding.trim(),
            owner_user_id: null,
          },
        ]);
        setSelected((current) => new Set(current).add(result.key));
        setCustomName("");
        setCustomGrounding("");
        setShowCustomForm(false);
      } catch (err) {
        setCustomError(err instanceof Error ? err.message : "添加失败，请重试");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("至少邀请一位顾问");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createCouncilSession({
          ideaId,
          personaKeys: Array.from(selected),
          title,
        });
        router.push(`/council/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建失败，请重试");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="title">
          会话标题（可选）
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="例：要不要先做付费还是先做免费版"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium">邀请顾问</p>
        {Array.from(
          personaList.reduce((groups, persona) => {
            const list = groups.get(persona.category) ?? [];
            list.push(persona);
            groups.set(persona.category, list);
            return groups;
          }, new Map<string, CouncilPersona[]>())
        ).map(([category, group]) => (
          <div key={category} className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {category}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.map((persona) => (
                <label
                  key={persona.key}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
                    selected.has(persona.key) ? "border-foreground bg-muted/50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(persona.key)}
                    onChange={() => toggle(persona.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{persona.display_name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                      {persona.grounding_note}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showCustomForm ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">添加自定义顾问</p>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="custom_name">
              姓名
            </label>
            <input
              id="custom_name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={60}
              placeholder="例：稻盛和夫"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="custom_grounding">
              已知思想/方法论依据（必填，至少 30 字）
            </label>
            <textarea
              id="custom_grounding"
              value={customGrounding}
              onChange={(e) => setCustomGrounding(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="例：阿米巴经营——把组织拆成小的核算单位，人人都能看懂经营数字；敬天爱人——义利并举的经营哲学"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">
              必须是真实存在、有据可查的人物——AI 只会基于你写的这段依据发言，不会自行编造这个人的观点。
            </p>
          </div>
          {customError && (
            <p className="text-sm text-destructive" role="alert">
              {customError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAddCustomPersona}
              disabled={customPending || customGrounding.trim().length < 30 || !customName.trim()}
            >
              {customPending ? "添加中…" : "添加"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowCustomForm(false)}
              disabled={customPending}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setShowCustomForm(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          + 添加自定义顾问
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "创建中…" : "开始对话"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          取消
        </Button>
      </div>
    </form>
  );
}
