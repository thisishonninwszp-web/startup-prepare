"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import {
  createFileMaterial,
  createTextMaterial,
  createUrlMaterial,
} from "./actions";
import { MATERIAL_SOURCE_TYPES, type MaterialSourceType } from "./types";

const QUICK_TYPES: Array<{ value: MaterialSourceType; label: string }> = [
  { value: "text", label: "普通文本" },
  { value: "customer_quote", label: "顾客话语" },
  { value: "business_fragment", label: "供应商/成本/财务" },
  { value: "emotion_fragment", label: "情绪/极限感" },
];

export function MaterialInput() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState<MaterialSourceType>("text");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function go(id: string, aiError: string | null) {
    if (aiError) setNotice(`材料已保存，但 AI 审阅失败：${aiError}`);
    router.push(`/materials/${id}`);
  }

  function submitText() {
    const raw = text.trim();
    if (!raw || isPending) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await createTextMaterial({ text: raw, sourceType });
        setText("");
        go(result.id, result.aiError);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "保存失败");
      }
    });
  }

  function submitUrl() {
    const raw = url.trim();
    if (!raw || isPending) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await createUrlMaterial(raw);
        setUrl("");
        go(result.id, result.aiError);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "URL 处理失败");
      }
    });
  }

  function submitFile(file: File) {
    if (isPending) return;
    setError("");
    setNotice("");
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      try {
        const result = await createFileMaterial(data);
        if (fileRef.current) fileRef.current.value = "";
        go(result.id, result.aiError);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "文件处理失败");
      }
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        三省入口
      </p>
      <h2 className="mt-2 text-lg font-medium">把现实材料丢进来</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        不需要先选工具。材料先进入中书起草，再由门下驳议，最后由你朱批分流。
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {QUICK_TYPES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setSourceType(item.value)}
            className={
              "rounded-full border px-3 py-1.5 text-xs transition-colors " +
              (sourceType === item.value
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        placeholder="刚刚现实里发生了什么？可以是一句话、顾客原话、供应商报价、成本变化、极限感、一个拖延动作。"
        className="mt-4 w-full resize-none rounded-xl border bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          保存后才会进入 AI 审阅；AI 输出只是草稿，不会自动写入其他模块。
        </span>
        <button
          type="button"
          onClick={submitText}
          disabled={
            isPending || !text.trim() || !MATERIAL_SOURCE_TYPES.includes(sourceType)
          }
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? "处理中…" : "进入三省审阅"}
        </button>
      </div>

      <div className="mt-6 grid gap-3 border-t pt-5 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="material-url">
            URL
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="material-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://..."
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <button
              type="button"
              disabled={isPending || !url.trim()}
              onClick={submitUrl}
              className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              抽取
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="material-file">
            文件
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            <span>TXT / Markdown / CSV / DOCX / XLSX / PDF</span>
            <input
              ref={fileRef}
              id="material-file"
              type="file"
              className="hidden"
              accept=".txt,.md,.markdown,.csv,.docx,.xlsx,.pdf,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) submitFile(file);
              }}
            />
          </label>
        </div>
      </div>

      {notice ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
