"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { deleteCompanyKbNote, updateCompanyKbNote } from "../actions";
import type { CompanyKbNote } from "../types";

export function NoteEditor({ note }: { note: CompanyKbNote }) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [deleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      await updateCompanyKbNote(note.id, title, content);
      setSaveMsg("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!confirm("确认删除这条笔记吗？删除后无法恢复。")) return;
    startDeleteTransition(async () => {
      try {
        await deleteCompanyKbNote(note.id);
        router.push("/company-kb");
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/company-kb" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">编辑笔记</h1>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          删除笔记
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
            标题
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="content" className="mb-1.5 block text-sm font-medium">
            内容
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
