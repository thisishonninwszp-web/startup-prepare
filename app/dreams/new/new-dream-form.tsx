"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createDreamCase } from "../actions";
import type { DreamContext, DreamScale } from "../types";

const CONTEXTS: { key: DreamContext; label: string; desc: string }[] = [
  { key: "personal", label: "人生", desc: "生活、关系、成长与存在方式" },
  { key: "business", label: "事业", desc: "想创造的工作、组织或行业变化" },
  { key: "cross", label: "交叉", desc: "人生和事业必须同时成立的未来" },
];
const SCALES: { key: DreamScale; label: string; desc: string }[] = [
  { key: "small", label: "小梦", desc: "1年内，改变一个日常体验" },
  { key: "big", label: "大梦", desc: "3–5年，改变生活或事业结构" },
  { key: "grand", label: "宏大梦", desc: "10年以上，影响他人、行业或社会" },
];

export function NewDreamForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [context, setContext] = useState<DreamContext>("personal");
  const [scale, setScale] = useState<DreamScale>("small");
  const [desire, setDesire] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const id = await createDreamCase({
        title,
        context,
        scale,
        initialDesire: desire,
      });
      router.push(`/dreams/${id}`);
    } catch (caught) {
      console.error("创建梦想失败", caught);
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1ea] px-4 py-8 text-stone-950 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dreams"
          className="inline-flex items-center gap-2 text-xs text-stone-500"
        >
          <ArrowLeft className="size-3" />
          返回梦想
        </Link>
        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.24em] text-stone-500">
          Open a future
        </p>
        <h1 className="mt-4 font-serif text-4xl tracking-[-0.04em]">
          你想看见怎样的一天？
        </h1>

        <div className="mt-10 space-y-8 rounded-[2rem] border border-stone-300 bg-stone-50 p-6 sm:p-8">
          <label className="block text-sm">
            给这个未来一个暂定名字
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：一个不用催促自己的早晨"
              className="mt-3 w-full border-0 border-b border-stone-300 bg-transparent px-0 py-3 text-xl outline-none focus:border-stone-900"
            />
          </label>

          <fieldset>
            <legend className="text-sm">它主要属于哪里？</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {CONTEXTS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setContext(item.key)}
                  className={
                    "rounded-2xl border p-4 text-left transition-colors " +
                    (context === item.key
                      ? "border-stone-900 bg-stone-900 text-stone-50"
                      : "border-stone-300 hover:border-stone-500")
                  }
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="mt-2 block text-xs leading-5 opacity-65">
                    {item.desc}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm">把镜头拉到多远？</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {SCALES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setScale(item.key)}
                  className={
                    "rounded-2xl border p-4 text-left transition-colors " +
                    (scale === item.key
                      ? "border-stone-900 bg-stone-900 text-stone-50"
                      : "border-stone-300 hover:border-stone-500")
                  }
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="mt-2 block text-xs leading-5 opacity-65">
                    {item.desc}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm">
            现在先写下最模糊、最原始的愿望
            <textarea
              value={desire}
              onChange={(event) => setDesire(event.target.value)}
              placeholder="不用解释为什么可行，也不用写计划……"
              className="mt-3 min-h-40 w-full rounded-2xl border border-stone-300 bg-white p-4 text-sm leading-7 outline-none focus:border-stone-700"
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim() || !desire.trim()}
            className="rounded-full"
          >
            {busy ? "正在保存…" : "进入未来场景"}
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}
