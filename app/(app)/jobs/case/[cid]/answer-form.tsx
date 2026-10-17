"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MIN_ANSWER_CHARS } from "@/lib/domains/jobs/case-shared";
import { submitCaseAnswerAction } from "../../actions";

/** 写结构。上面显示从出题起过了几分钟（建议 15 分钟，不强制）。 */
export function AnswerForm({ id, startedAt }: { id: string; startedAt: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const tick = () => setMinutes(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 60_000)));
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await submitCaseAnswerAction(id, text);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">写你的结构</h2>
      <p className="text-xs leading-6 text-muted-foreground">
        过了 {minutes} 分钟{minutes >= 15 ? "，已经超过建议的 15 分钟，面试里这时候该先把结论说出来了。" : "，建议 15 分钟内写完。"}
        用日文写，像在面试里说的那样：先说怎么理解这道题，再说怎么拆、先做什么。
      </p>
      <Textarea
        lang="ja"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例：まず目標を確認します。売上は顧客数×顧客あたり売上に分けて…"
      />
      <div className="flex items-center gap-3">
        <Button disabled={pending || text.trim().length < MIN_ANSWER_CHARS} onClick={submit}>
          {pending ? "面试官在看你写的…" : "回答する"}
        </Button>
        <span className="text-xs text-muted-foreground">{text.trim().length} 字</span>
      </div>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </section>
  );
}
