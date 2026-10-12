"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addViewAction,
  archiveQuestionAction,
  createQuestionAction,
  researchQuestionAction,
  updateCriterionAction,
} from "../actions";

/** 提一个要一直追的问题。"怎么才算"可以先空着，之后再补。 */
export function CreateQuestionForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [criterion, setCriterion] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await createQuestionAction(question, criterion);
          if (result.ok) router.push(`/signals/questions/${result.id}`);
          else setError(result.message);
        });
      }}
    >
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="你想一直追下去的问题，比如：中国哪些做法会在五年内来日本"
        maxLength={200}
      />
      <Input
        value={criterion}
        onChange={(e) => setCriterion(e.target.value)}
        placeholder="怎么才算？比如：东京的普通人一年里至少用过一次（可以先不填）"
        maxLength={300}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || question.trim().length < 4}>
        {pending ? "记下中…" : "开始追这个问题"}
      </Button>
    </form>
  );
}

/** 补上或改"怎么才算"。 */
export function CriterionForm({ questionId, initial }: { questionId: string; initial: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(!initial);
  const [criterion, setCriterion] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <p className="text-sm leading-7">
        <span className="text-muted-foreground">怎么才算：</span>
        {initial}
        <Button variant="link" size="sm" className="h-auto px-2 py-0" onClick={() => setEditing(true)}>
          改
        </Button>
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateCriterionAction(questionId, criterion);
          if (result.ok) {
            setEditing(false);
            router.refresh();
          } else setError(result.message);
        });
      }}
    >
      <Input
        value={criterion}
        onChange={(e) => setCriterion(e.target.value)}
        placeholder="怎么才算？不定下来，五年后没法对账"
        maxLength={300}
      />
      <Button type="submit" size="sm" className="h-10 shrink-0 sm:h-9" disabled={pending}>
        {pending ? "存…" : "存下"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

/** 写下或更新看法。旧的不删：几个月后能看到自己的看法是被哪条证据推着变过来的。 */
export function ViewForm({ questionId, hasView }: { questionId: string; hasView: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(!hasView);
  const [view, setView] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        看法变了，写新的一版
      </Button>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addViewAction(questionId, view, reason);
          if (result.ok) {
            setView("");
            setReason("");
            setOpen(false);
            setError(null);
            router.refresh();
          } else setError(result.message);
        });
      }}
    >
      <Textarea
        value={view}
        onChange={(e) => setView(e.target.value)}
        placeholder={
          hasView
            ? "现在你怎么看？"
            : "凭直觉写一句你现在的看法，不用查资料，也不用写对。比如：直播带货会来，即时零售不会。"
        }
        rows={3}
        maxLength={500}
      />
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={hasView ? "为什么改？是哪条证据让你改的？" : "为什么这么看？一句就够（可以不写）"}
        maxLength={500}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || view.trim().length < 2}>
          {pending ? "记下中…" : "记下这一版"}
        </Button>
        {hasView && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}

/** 让 AI 查一轮。要半分钟左右，查完整页刷新。 */
export function ResearchButton({ questionId, label }: { questionId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await researchQuestionAction(questionId);
            if (result.ok) {
              setError(null);
              router.refresh();
            } else setError(result.message);
          })
        }
      >
        {pending ? "在拆问题、分头上网查，要半分钟左右…" : label}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** 不追了：收起来。 */
export function ArchiveQuestionButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveQuestionAction(questionId);
          if (result.ok) router.push("/signals/questions");
        })
      }
    >
      {pending ? "收起中…" : "不追了，收起来"}
    </Button>
  );
}

/** 文章骨架：照着它写每周那一篇。只搬运你的看法和查到的东西，观点要你自己写。 */
export function OutlinePanel({ outline }: { outline: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Textarea readOnly value={outline} rows={14} className="font-mono text-xs leading-6" />
      <Button
        className="mt-2"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(outline);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "复制好了" : "复制"}
      </Button>
    </div>
  );
}
