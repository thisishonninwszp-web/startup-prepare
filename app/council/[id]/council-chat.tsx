"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sendCouncilMessage } from "@/app/council/actions";
import type { CouncilPersona, CouncilSessionWithMessages } from "@/app/council/types";

function personaLabel(
  personaByKey: Record<string, CouncilPersona>,
  key: string | null
): string {
  if (!key) return "";
  return personaByKey[key]?.display_name ?? key;
}

export function CouncilChat({
  session,
  personaByKey,
}: {
  session: CouncilSessionWithMessages;
  personaByKey: Record<string, CouncilPersona>;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mention(personaKey: string) {
    const name = personaLabel(personaByKey, personaKey);
    setContent((current) =>
      current.includes(`@${name}`) ? current : `@${name} ${current}`
    );
  }

  function handleSend() {
    const text = content.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      try {
        await sendCouncilMessage({
          sessionId: session.id,
          content: text,
          idempotencyKey: crypto.randomUUID(),
        });
        setContent("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "发送失败，请重试");
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <Link href="/council" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            {session.title || "顾问团会话"}
          </h1>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
        以下发言是 AI 基于公开已知方法论的推演，不是这些人物的真实言论。
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_14rem]">
        {/* Messages */}
        <div className="space-y-4">
          {session.messages.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              说说你的想法或者你现在纠结的问题，看看这几位顾问怎么说。
            </p>
          )}
          {session.messages.map((message) => {
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-foreground px-4 py-2.5 text-sm text-background">
                    {message.content}
                  </div>
                </div>
              );
            }
            const persona = message.persona_key ? personaByKey[message.persona_key] : null;
            return (
              <div key={message.id} className="flex justify-start">
                <div className="max-w-[85%] space-y-1.5 rounded-2xl rounded-tl-sm border bg-card px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold">
                      {persona?.display_name ?? message.persona_key}
                    </span>
                    {message.grounded_reference && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {message.grounded_reference}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  {message.sharpest_question && (
                    <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs font-medium leading-relaxed">
                      {message.sharpest_question}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar: personas in session */}
        <aside className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            在场顾问
          </p>
          {session.personas.map((p) => {
            const persona = personaByKey[p.persona_key];
            return (
              <button
                key={p.persona_key}
                type="button"
                onClick={() => mention(p.persona_key)}
                title="点击 @ 这位顾问"
                className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className="truncate">{persona?.display_name ?? p.persona_key}</span>
                {p.turns_since_last_spoke >= 3 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {p.turns_since_last_spoke} 轮未发言
                  </span>
                )}
              </button>
            );
          })}
        </aside>
      </div>

      {/* Composer */}
      <div className="sticky bottom-4 mt-6 rounded-xl border bg-card p-3 shadow-sm">
        {error && (
          <p className="mb-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="说点什么……"
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={pending || !content.trim()}
            className="shrink-0 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-50"
          >
            {pending ? "发送中…" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
