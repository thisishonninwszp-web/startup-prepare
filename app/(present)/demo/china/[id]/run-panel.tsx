"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STEP_LABELS, type ChinaRunStatus, type ChinaStep } from "@/lib/domains/jobs/china-shared";
import { advanceChinaRunAction, retryChinaCompaniesAction } from "../actions";

const RUNNING_TEXT: Record<ChinaStep, string> = {
  plan: "中国語の検索語を考えています…",
  companies: "中国語で検索して、見つかったページを読んでいます…（30秒ほど）",
  japan: "日本でも同じ条件がそろっているか、日本の資料で調べています…（30秒ほど）",
};

/**
 * 还有没跑的步骤就接着跑（一步一个请求）；跑完一步刷新页面显示结果，新的状态再触发下一步。
 * 停在半路的不自动重跑，等他点「もう一度」（从停下的那一步接着跑）。一家都没找到时给「もう一度探す」。
 */
export function RunPanel({ id, status, step, error }: { id: string; status: ChinaRunStatus; step: ChinaStep | null; error: string | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setRunning(true);
    setMessage(null);
    const r = await action();
    setRunning(false);
    if (!r.ok) setMessage(r.message);
    router.refresh();
  };

  useEffect(() => {
    const key = `${status}:${step}`;
    if (!step || status === "failed" || started.current === key) return;
    started.current = key;
    void run(() => advanceChinaRunAction(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, step]);

  if (status === "none_found") {
    return (
      <div className="text-sm leading-7 text-muted-foreground">
        <Button variant="outline" size="sm" disabled={running} onClick={() => void run(() => retryChinaCompaniesAction(id))}>
          {running ? "探しています…" : "もう一度探す"}
        </Button>
        {message && <p className="mt-2 text-xs">{message}</p>}
      </div>
    );
  }
  if (!step) return null;
  const stopped = !running && (status === "failed" || message !== null);
  return (
    <div className="text-sm leading-7 text-muted-foreground">
      {stopped ? (
        <>
          <p>途中で止まりました（{STEP_LABELS[step]}）。もう一度押すと、止まったところから続けます。</p>
          {(message ?? error) && <p className="text-xs">{message ?? error}</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void run(() => advanceChinaRunAction(id))}>
            もう一度
          </Button>
        </>
      ) : (
        <p>{RUNNING_TEXT[step]}</p>
      )}
    </div>
  );
}
