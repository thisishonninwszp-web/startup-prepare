"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  addCompanyEvent,
  addCompanyNote,
  deleteCompanyEvent,
  deleteCompanyNote,
  updateCompany,
} from "@/app/(app)/knowledge/actions";
import type { CompanyDetail, CompanyType } from "@/app/(app)/knowledge/types";
import { JobOutreachPanel } from "./job-outreach-panel";

type Props = {
  company: CompanyDetail;
  companyTypes: readonly { key: CompanyType; label: string }[];
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CompanyDetailClient({ company, companyTypes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Edit CEO notes
  const [editingCeo, setEditingCeo] = useState(false);
  const [ceoNotes, setCeoNotes] = useState(company.ceo_notes);
  const [name, setName] = useState(company.name);
  const [companyType, setCompanyType] = useState<CompanyType>(company.company_type);

  // New event form
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventDesc, setEventDesc] = useState("");
  const [eventYear, setEventYear] = useState("");
  const [eventParty, setEventParty] = useState("");

  // New note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState("");

  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function saveCeoNotes() {
    startTransition(async () => {
      try {
        await updateCompany(company.id, name, companyType, ceoNotes);
        setEditingCeo(false);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  function submitEvent(e: React.FormEvent) {
    e.preventDefault();
    const year = eventYear ? parseInt(eventYear, 10) : null;
    startTransition(async () => {
      try {
        await addCompanyEvent(company.id, eventDesc, year, eventParty);
        setEventDesc("");
        setEventYear("");
        setEventParty("");
        setShowEventForm(false);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await addCompanyNote(company.id, noteContent);
        setNoteContent("");
        setShowNoteForm(false);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  function removeEvent(eventId: string) {
    startTransition(async () => {
      try {
        await deleteCompanyEvent(eventId);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  function removeNote(noteId: string) {
    startTransition(async () => {
      try {
        await deleteCompanyNote(noteId);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  const currentTypeLabel =
    companyTypes.find((t) => t.key === company.company_type)?.label ?? company.company_type;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Link href="/companies" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          {editingCeo ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border bg-background px-2 py-1 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">{company.name}</h1>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">{currentTypeLabel}</p>
        </div>
        {!editingCeo && (
          <button
            onClick={() => setEditingCeo(true)}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            编辑
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* CEO 思路 */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          CEO / 关键人思路
        </h2>
        {editingCeo ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {companyTypes.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setCompanyType(t.key)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    companyType === t.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={ceoNotes}
              onChange={(e) => setCeoNotes(e.target.value)}
              rows={5}
              placeholder="社长的思路、决策风格、重点关注领域……"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                onClick={saveCeoNotes}
                disabled={isPending}
                className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {isPending ? "保存中…" : "保存"}
              </button>
              <button
                onClick={() => {
                  setEditingCeo(false);
                  setName(company.name);
                  setCeoNotes(company.ceo_notes);
                  setCompanyType(company.company_type);
                }}
                className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground"
              >
                取消
              </button>
            </div>
          </div>
        ) : ceoNotes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{ceoNotes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">（暂无）</p>
        )}
      </section>

      {/* 大事记时间线 */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            大事记时间线
          </h2>
          <button
            onClick={() => setShowEventForm((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>

        {showEventForm && (
          <form onSubmit={submitEvent} className="mb-4 rounded-lg border p-3 space-y-3">
            <div className="flex gap-2">
              <input
                type="number"
                value={eventYear}
                onChange={(e) => setEventYear(e.target.value)}
                placeholder="年份（如 2019）"
                className="w-32 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={eventParty}
                onChange={(e) => setEventParty(e.target.value)}
                placeholder="相关方（可选，如：来源：富士公司）"
                className="flex-1 rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <textarea
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
              placeholder="事件描述（如：购入 DTF 打印机，开始数字化改造…）"
              rows={2}
              required
              className="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-foreground px-3 py-1 text-sm font-medium text-background disabled:opacity-50"
              >
                {isPending ? "添加中…" : "添加"}
              </button>
              <button
                type="button"
                onClick={() => setShowEventForm(false)}
                className="rounded-lg border px-3 py-1 text-sm text-muted-foreground"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {company.events.length === 0 && !showEventForm ? (
          <p className="text-sm text-muted-foreground">（暂无大事记）</p>
        ) : (
          <div className="space-y-2">
            {company.events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <span className="w-12 shrink-0 text-right text-xs font-mono text-muted-foreground">
                  {ev.year ?? "—"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{ev.description}</p>
                  {ev.related_party && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{ev.related_party}</p>
                  )}
                </div>
                <button
                  onClick={() => removeEvent(ev.id)}
                  disabled={isPending}
                  className="shrink-0 text-muted-foreground/40 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 想法 / 备注 */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            想法 / 备注
          </h2>
          <button
            onClick={() => setShowNoteForm((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>

        {showNoteForm && (
          <form onSubmit={submitNote} className="mb-4 rounded-lg border p-3 space-y-3">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="关于这家公司的想法、销售策略、关键信息……"
              rows={3}
              required
              className="w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-foreground px-3 py-1 text-sm font-medium text-background disabled:opacity-50"
              >
                {isPending ? "添加中…" : "添加"}
              </button>
              <button
                type="button"
                onClick={() => setShowNoteForm(false)}
                className="rounded-lg border px-3 py-1 text-sm text-muted-foreground"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {company.notes.length === 0 && !showNoteForm ? (
          <p className="text-sm text-muted-foreground">（暂无备注）</p>
        ) : (
          <div className="space-y-2">
            {company.notes.map((note) => (
              <div key={note.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {fmtDate(note.created_at)}
                    {note.idea_id && " · 关联想法"}
                  </p>
                </div>
                <button
                  onClick={() => removeNote(note.id)}
                  disabled={isPending}
                  className="shrink-0 text-muted-foreground/40 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 求职触达策略（仅求职目标或两者皆是） */}
      {(company.company_type === "prospect" || company.company_type === "both") && (
        <section className="mb-8">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            求职触达策略
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            正确时机 × 正确地点 × 正确对象 × 正确信息——AI 综合公司档案与你的知识生成可执行计划。
          </p>
          <JobOutreachPanel companyId={company.id} />
        </section>
      )}
    </div>
  );
}
