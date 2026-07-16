"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircleQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  answerRealityFocus,
  createRealityFocusSession,
  setRealityFocusExports,
} from "../focus-actions";
import type {
  RealityFocusLocator,
  RealityFocusResponse,
  RealityFocusSession,
} from "../focus";

const QUICK_QUESTIONS = [
  "这可能意味着什么？",
  "我可能混淆了什么？",
  "有哪些可选应对？",
];

export type FocusRequest = {
  versionId: string;
  locator: RealityFocusLocator;
};

export function FocusedInquiryPanel({
  caseId,
  initialSessions,
  request,
  onClose,
}: {
  caseId: string;
  initialSessions: RealityFocusSession[];
  request: FocusRequest | null;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(
    initialSessions.find((item) => item.status === "open")?.id ?? null
  );
  const [question, setQuestion] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledRequest = useRef("");
  const pendingClientKey = useRef<string | null>(null);

  const active = sessions.find((item) => item.id === activeId) ?? null;

  useEffect(() => {
    if (!active || active.status !== "open") return;
    const pending = [...active.messages]
      .reverse()
      .find(
        (message) =>
          message.role === "user" &&
          !active.messages.some(
            (reply) =>
              reply.turn_no === message.turn_no &&
              (reply.role === "assistant" || reply.role === "safety")
          )
      );
    if (!pending?.client_key) return;
    pendingClientKey.current = pending.client_key;
    setQuestion(
      (pending.content as { text?: string }).text ?? ""
    );
    setError("上一次问题已保存，但AI尚未回答。可以直接重试。");
  }, [active]);

  useEffect(() => {
    if (!request) return;
    const key = `${request.versionId}:${request.locator.type}:${request.locator.index}`;
    if (handledRequest.current === key) {
      const existing = sessions.find(
        (item) =>
          item.version_id === request.versionId &&
          item.anchor.type === request.locator.type &&
          item.anchor.index === request.locator.index
      );
      if (existing) setActiveId(existing.id);
      return;
    }
    handledRequest.current = key;
    setCreating(true);
    setError(null);
    void createRealityFocusSession(
      caseId,
      request.versionId,
      request.locator
    )
      .then((session) => {
        if (!session) throw new Error("创建聚焦探索失败");
        setSessions((current) => [session, ...current]);
        setActiveId(session.id);
      })
      .catch((caught) => {
        handledRequest.current = "";
        setError(
          caught instanceof Error ? caught.message : "创建聚焦探索失败"
        );
      })
      .finally(() => setCreating(false));
  }, [caseId, request, sessions]);

  function replaceSession(session: RealityFocusSession) {
    setSessions((current) =>
      current.map((item) => (item.id === session.id ? session : item))
    );
  }

  async function sendQuestion(text: string, forceFinalize = false) {
    if (!active || active.status !== "open" || !text.trim()) return;
    setSending(true);
    setError(null);
    const clientKey =
      pendingClientKey.current ?? crypto.randomUUID();
    pendingClientKey.current = clientKey;
    try {
      const updated = await answerRealityFocus({
        session_id: active.id,
        question: text,
        client_key: clientKey,
        force_finalize: forceFinalize,
      });
      if (updated) replaceSession(updated);
      pendingClientKey.current = null;
      setQuestion("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "AI回答失败，问题已保存，请重试"
      );
    } finally {
      setSending(false);
    }
  }

  async function updateExports(
    includeInClosure: boolean,
    includeInNextVersion: boolean
  ) {
    if (!active || active.status !== "completed") return;
    setExporting(true);
    setError(null);
    try {
      await setRealityFocusExports({
        session_id: active.id,
        include_in_closure: includeInClosure,
        include_in_next_version: includeInNextVersion,
      });
      replaceSession({
        ...active,
        include_in_closure: includeInClosure,
        include_in_next_version: includeInNextVersion,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存出口失败");
    } finally {
      setExporting(false);
    }
  }

  const panel = active ? (
    <div className="flex max-h-[85vh] flex-col rounded-t-xl border bg-card shadow-2xl lg:max-h-[calc(100vh-3rem)] lg:rounded-lg lg:shadow-sm">
      <div className="flex items-start gap-3 border-b p-4">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground">
            {active.anchor.label}
          </p>
          <p className="mt-1 text-sm font-medium leading-5">
            {active.anchor.text}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveId(null);
            onClose();
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="关闭聚焦探索"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {active.messages.map((message) => {
          if (message.role === "user") {
            const text = (message.content as { text?: string }).text ?? "";
            return (
              <div
                key={message.id}
                className="ml-6 rounded-md bg-foreground p-3 text-xs leading-5 text-background"
              >
                {text}
              </div>
            );
          }
          if (message.role === "safety") {
            return (
              <div
                key={message.id}
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive"
              >
                {(message.content as { message?: string }).message}
              </div>
            );
          }
          const response = message.content as RealityFocusResponse;
          return <FocusAnswer key={message.id} response={response} />;
        })}

        {active.status === "completed" && active.summary && (
          <div className="rounded-lg border-2 border-foreground p-4">
            <p className="text-xs font-medium">探索摘要</p>
            <p className="mt-2 text-xs leading-5">
              {active.summary.updated_understanding}
            </p>
            <dl className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <div>
                <dt className="text-foreground">仍然未知</dt>
                <dd>{active.summary.remaining_unknown}</dd>
              </div>
              <div>
                <dt className="text-foreground">候选现实动作</dt>
                <dd>{active.summary.candidate_action}</dd>
              </div>
              <div>
                <dt className="text-foreground">应对取舍</dt>
                <dd>
                  <ul className="list-disc pl-4">
                    {active.summary.option_tradeoffs.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              {active.summary.ai_inferences.length > 0 && (
                <div>
                  <dt className="text-foreground">
                    AI推断（尚未确认）
                  </dt>
                  <dd>
                    <ul className="list-disc pl-4">
                      {active.summary.ai_inferences.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4 space-y-2 border-t pt-3">
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={active.include_in_closure}
                  disabled={exporting}
                  onChange={(event) =>
                    void updateExports(
                      event.target.checked,
                      active.include_in_next_version
                    )
                  }
                />
                <span>带入当前版本的收束依据</span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={active.include_in_next_version}
                  disabled={exporting}
                  onChange={(event) =>
                    void updateExports(
                      active.include_in_closure,
                      event.target.checked
                    )
                  }
                />
                <span>生成下一版现状地图时引用一次</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {active.status === "open" && (
        <div className="border-t p-4">
          {active.messages.length === 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setQuestion(item)}
                  className="rounded-full border px-2.5 py-1 text-[10px] hover:bg-muted"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              pendingClientKey.current = null;
            }}
            rows={3}
            maxLength={2000}
            placeholder="围绕这一点问一个具体问题"
            className="w-full rounded-md border bg-background p-3 text-xs leading-5"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={sending || !question.trim()}
              onClick={() => void sendQuestion(question)}
            >
              {sending && <LoaderCircle className="animate-spin" />}
              提问
            </Button>
            {active.messages.some((item) => item.role === "assistant") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sending}
                onClick={() =>
                  void sendQuestion("请基于目前内容现在总结。", true)
                }
              >
                现在总结
              </Button>
            )}
          </div>
        </div>
      )}

      <AiErrorNotice error={error} className="m-3 text-xs" />
    </div>
  ) : (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="size-4" />
        <h2 className="text-xs font-medium">聚焦探索</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        在地图任意条目旁点击“问AI”，围绕那一点深入理解。
      </p>
      {creating && (
        <p className="mt-3 flex items-center gap-2 text-xs">
          <LoaderCircle className="size-3.5 animate-spin" />
          创建中…
        </p>
      )}
      {sessions.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-[10px] text-muted-foreground">历史探索</p>
          <div className="mt-2 space-y-1">
            {sessions.slice(0, 6).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveId(session.id)}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                {session.anchor.text}
              </button>
            ))}
          </div>
        </div>
      )}
      <AiErrorNotice error={error} className="mt-3 text-xs" />
    </div>
  );

  return (
    <>
      {active && (
        <button
          type="button"
          aria-label="关闭聚焦探索"
          onClick={() => {
            setActiveId(null);
            onClose();
          }}
          className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
        />
      )}
      <div
        className={
          active
            ? "fixed inset-x-0 bottom-0 z-50 lg:static lg:z-auto"
            : ""
        }
      >
        {panel}
      </div>
    </>
  );
}

function FocusAnswer({ response }: { response: RealityFocusResponse }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5">
      <p className="font-medium">已经明确的</p>
      <ul className="mt-1 list-disc pl-4">
        {response.explicit_content.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {response.ai_inferences.length > 0 && (
        <>
          <p className="mt-3 font-medium">AI推断（尚未确认）</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {response.ai_inferences.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      {response.unknowns.length > 0 && (
        <>
          <p className="mt-3 font-medium">仍然未知</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {response.unknowns.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 font-medium">可选应对</p>
      <div className="mt-2 space-y-2">
        {response.response_options.map((option) => (
          <div key={option.title} className="rounded border bg-card p-2.5">
            <p className="font-medium">{option.title}</p>
            <p className="mt-1 text-muted-foreground">
              适用：{option.when_it_fits}
            </p>
            <p className="text-muted-foreground">代价：{option.tradeoff}</p>
            <p className="mt-1">小尝试：{option.small_try}</p>
          </div>
        ))}
      </div>
      {response.follow_up_question && (
        <p className="mt-3 border-t pt-2 font-medium">
          {response.follow_up_question}
        </p>
      )}
    </div>
  );
}
