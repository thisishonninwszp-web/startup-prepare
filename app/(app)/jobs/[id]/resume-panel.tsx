"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RESUME_SECTION_KEYS, RESUME_SECTIONS, sectionText, type JobResume, type ResumeSectionKey } from "@/lib/domains/jobs/shared";
import { saveResumeEditAction, tailorResumeAction } from "../actions";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "复制了" : "复制"}
    </Button>
  );
}

/** 職務経歴書四段 + 志望動機。每段可以直接改（存成新版本）、复制；删掉的句子和最可能被追问的句子列在下面。 */
export function ResumePanel({ postingId, resume, hasEntries }: { postingId: string; resume: JobResume | null; hasEntries: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResumeSectionKey | null>(null);
  const [draft, setDraft] = useState("");

  const tailor = () =>
    startTransition(async () => {
      setError(null);
      const r = await tailorResumeAction(postingId);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  const saveEdit = () =>
    startTransition(async () => {
      if (!resume || !editing) return;
      setError(null);
      const r = await saveResumeEditAction({ resumeId: resume.id, postingId, key: editing, text: draft });
      if (!r.ok) setError(r.message);
      else {
        setEditing(null);
        router.refresh();
      }
    });

  return (
    <section className="space-y-4 text-sm leading-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">按这家改的简历{resume ? `（第 ${resume.version} 版）` : ""}</h2>
        <div className="flex flex-wrap gap-2">
          {resume && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/resume-print/${resume.id}`} target="_blank">
                打印 / 存 PDF
              </Link>
            </Button>
          )}
          <Button size="sm" disabled={pending || !hasEntries} onClick={tailor}>
            {pending && !editing ? "在写……" : resume ? "重新写一版" : "写一版"}
          </Button>
        </div>
      </div>
      {!hasEntries && (
        <p className="text-muted-foreground">
          底稿里还没有确认过的经历，写不了。先去
          <Link href="/jobs/base" className="underline underline-offset-4">
            底稿
          </Link>
          写几条。
        </p>
      )}

      {resume &&
        RESUME_SECTION_KEYS.map((key) => {
          const text = sectionText(key, resume.sections[key]);
          const edited = typeof resume.sections[key]?.user_text === "string";
          return (
            <div key={key} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">
                  {RESUME_SECTIONS[key]}
                  {edited && <span className="ml-2 text-xs font-normal text-muted-foreground">你改过（这一段不核对出处）</span>}
                </h3>
                <div className="flex gap-1">
                  <CopyButton text={text} />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(key);
                      setDraft(text);
                    }}
                  >
                    改
                  </Button>
                </div>
              </div>
              {editing === key ? (
                <div className="mt-2 space-y-2">
                  <Textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pending} onClick={saveEdit}>
                      存成新版本
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
                      不改了
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-line">{text || "（这一段没有底稿撑着的句子）"}</p>
              )}
            </div>
          );
        })}

      {resume && resume.probes.length > 0 && (
        <div>
          <h3 className="font-semibold">面试官最可能追问的</h3>
          <ul className="mt-1 space-y-2">
            {resume.probes.map((p) => (
              <li key={p.sentence}>
                <p className="text-xs text-muted-foreground">「{p.sentence}」</p>
                <p>{p.question}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resume && resume.dropped.length > 0 && (
        <details className="text-xs leading-6 text-muted-foreground">
          <summary className="cursor-pointer">删掉的句子（{resume.dropped.length}）—— 没有底稿撑着</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {resume.dropped.map((d) => (
              <li key={`${d.section}-${d.text}`}>
                {RESUME_SECTIONS[d.section]}：{d.text}（{d.reason}）
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="text-muted-foreground">{error}</p>}
    </section>
  );
}
