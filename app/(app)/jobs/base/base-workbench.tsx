"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BASE_QUESTIONS,
  CAREER_TOPIC_KEYS,
  CAREER_TOPICS,
  type CareerEntry,
  type CareerTopic,
  type DroppedSentence,
} from "@/lib/domains/jobs/shared";
import { confirmEntryAction, deleteEntryAction, draftEntryAction } from "../actions";

type Draft = { id: string; draftJa: string; dropped: DroppedSentence[]; followUp: string };
type FormState = { id: string | null; topic: CareerTopic; question: string; org: string; period: string; raw: string };

const EMPTY_FORM: FormState = { id: null, topic: "work", question: "", org: "", period: "", raw: "" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function BaseWorkbench({ entries }: { entries: CareerEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [extra, setExtra] = useState("");

  const confirmedCount = (topic: CareerTopic) => entries.filter((e) => e.topic === topic && e.confirmed_at).length;
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...(f ?? EMPTY_FORM), ...patch }));

  const open = (topic: CareerTopic, question: string) => {
    setForm({ ...EMPTY_FORM, topic, question });
    setDraft(null);
    setExtra("");
    setError(null);
  };

  const edit = (entry: CareerEntry) => {
    setForm({ id: entry.id, topic: entry.topic, question: "", org: entry.org, period: entry.period, raw: entry.raw_text });
    setDraft(null);
    setExtra("");
    setError(null);
  };

  const runDraft = (raw: string) =>
    startTransition(async () => {
      if (!form) return;
      setError(null);
      const r = await draftEntryAction({ ...form, id: draft?.id ?? form.id, raw });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setForm({ ...form, id: r.id, raw });
      setDraft({ id: r.id, draftJa: r.draft_ja, dropped: r.dropped, followUp: r.follow_up });
      setExtra("");
      router.refresh();
    });

  const confirm = () =>
    startTransition(async () => {
      if (!form || !draft) return;
      setError(null);
      const r = await confirmEntryAction({ id: draft.id, org: form.org, period: form.period, draftJa: draft.draftJa });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setForm(null);
      setDraft(null);
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteEntryAction(id);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-base font-semibold">要聊到的</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">挑一个问题回答。每个话题至少确认一条，这一项就算聊过了。</p>
        <ul className="mt-4 space-y-4">
          {CAREER_TOPIC_KEYS.map((topic) => (
            <li key={topic} className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium">
                {CAREER_TOPICS[topic]}
                <span className="ml-2 font-mono text-xs text-muted-foreground">确认过 {confirmedCount(topic)} 条</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BASE_QUESTIONS[topic].map((q) => (
                  <Button
                    key={q}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal py-1.5 text-left"
                    onClick={() => open(topic, q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {form && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">{form.question || `${CAREER_TOPICS[form.topic]}：改这一条`}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="在哪" hint="公司、学校、项目名">
              <Input value={form.org} onChange={(e) => set({ org: e.target.value })} />
            </Field>
            <Field label="期间" hint="比如 2026-04〜现在">
              <Input value={form.period} onChange={(e) => set({ period: e.target.value })} />
            </Field>
          </div>
          <Field label="你的话" hint="写一件具体的事：做了什么、跟谁、结果怎样。有数字就写上。">
            <Textarea rows={6} value={form.raw} onChange={(e) => set({ raw: e.target.value })} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending} onClick={() => runDraft(form.raw)}>
              {pending && !draft ? "在整理……" : "整理成日文"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setForm(null)}>
              先不写
            </Button>
          </div>

          {draft && (
            <div className="space-y-4 border-t border-border pt-4">
              <Field label="日文稿" hint="你可以直接改。点确认之后，改简历时才会用到这一条。">
                <Textarea rows={5} value={draft.draftJa} onChange={(e) => setDraft({ ...draft, draftJa: e.target.value })} />
              </Field>
              {draft.dropped.length > 0 && (
                <div className="text-xs leading-6 text-muted-foreground">
                  <p className="font-medium text-foreground">删掉的句子</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {draft.dropped.map((d) => (
                      <li key={d.text}>
                        {d.text}（{d.reason}）
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {draft.followUp && (
                <div className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">追问：</span>
                    {draft.followUp}
                  </p>
                  <Textarea
                    rows={3}
                    placeholder="补一句，会接在你原来的话后面重新整理"
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !extra.trim()}
                    onClick={() => runDraft(`${form.raw}\n${extra.trim()}`)}
                  >
                    补上，重新整理
                  </Button>
                </div>
              )}
              <Button type="button" disabled={pending || !draft.draftJa.trim()} onClick={confirm}>
                确认这一条
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-muted-foreground">{error}</p>}
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold">已经写下的（{entries.length}）</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">这里空着。从上面挑一个问题开始，第一条写 Focus 的工作最快。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="rounded-lg border border-border p-4 text-sm leading-7">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={e.confirmed_at ? "secondary" : "muted"}>{e.confirmed_at ? "确认过" : "没确认"}</Badge>
                  <span className="font-medium">{CAREER_TOPICS[e.topic]}</span>
                  <span className="text-muted-foreground">
                    {e.org}
                    {e.period ? ` · ${e.period}` : ""}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line">{e.draft_ja || e.raw_text}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => edit(e)}>
                    改
                  </Button>
                  <ConfirmButton type="button" size="sm" variant="ghost" disabled={pending} onClick={() => remove(e.id)}>
                    删掉
                  </ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
