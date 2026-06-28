"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  MessageCircleQuestion,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  attachRealityToDream,
  continueDreamInterview,
  createDreamVersion,
} from "../actions";
import { DreamVisionCard } from "../dream-vision-card";
import type {
  DreamCaseDetail,
  listRealityVersionChoices,
} from "../queries";

type RealityChoice = Awaited<
  ReturnType<typeof listRealityVersionChoices>
>[number];

const CONTEXT_LABEL = {
  personal: "人生",
  business: "事业",
  cross: "人生／事业交叉",
} as const;
const SCALE_LABEL = {
  small: "小梦 · 1年内",
  big: "大梦 · 3–5年",
  grand: "宏大梦 · 10年以上",
} as const;

export function DreamWorkspace({
  initialCase,
  realityChoices,
}: {
  initialCase: DreamCaseDetail;
  realityChoices: RealityChoice[];
}) {
  const router = useRouter();
  const latest = initialCase.versions[0] ?? null;
  const [answer, setAnswer] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [realityVersionId, setRealityVersionId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function ask() {
    setBusy("ask");
    setError(null);
    try {
      const result = await continueDreamInterview(
        initialCase.id,
        answer || undefined
      );
      setAnswer("");
      setNotice(result.questions.join(" / "));
      router.refresh();
    } catch (caught) {
      console.error("继续梦想访谈失败", caught);
      setError(caught instanceof Error ? caught.message : "访谈失败");
    } finally {
      setBusy(null);
    }
  }

  async function synthesize() {
    setBusy("vision");
    setError(null);
    try {
      await createDreamVersion(initialCase.id, changeReason);
      setChangeReason("");
      setNotice("新的愿景版本已保存，旧版本不会被覆盖。");
      router.refresh();
    } catch (caught) {
      console.error("生成梦想愿景失败", caught);
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function attachReality() {
    if (!realityVersionId) return;
    setBusy("reality");
    setError(null);
    try {
      await attachRealityToDream(initialCase.id, realityVersionId);
      setNotice("现状地图已作为折叠区来源。它不会改写未来场景。");
      router.refresh();
    } catch (caught) {
      console.error("连接现状地图失败", caught);
      setError(caught instanceof Error ? caught.message : "连接失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-stone-950">
      <header className="border-b border-stone-300 bg-stone-50 px-4 py-7 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/dreams"
            className="inline-flex items-center gap-2 text-xs text-stone-500"
          >
            <ArrowLeft className="size-3" />
            返回梦想
          </Link>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex gap-2 text-[10px] text-stone-500">
                <span className="rounded-full border border-stone-300 px-2 py-1">
                  {CONTEXT_LABEL[initialCase.context]}
                </span>
                <span className="rounded-full border border-stone-300 px-2 py-1">
                  {SCALE_LABEL[initialCase.scale]}
                </span>
              </div>
              <h1 className="mt-4 font-serif text-3xl tracking-[-0.03em] sm:text-4xl">
                {initialCase.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                {initialCase.initial_desire}
              </p>
            </div>
            {latest && (
              <label className="relative">
                <select
                  value={latest.version_no}
                  onChange={(event) =>
                    router.push(
                      `/dreams/${initialCase.id}/versions/${event.target.value}`
                    )
                  }
                  className="appearance-none rounded-full border border-stone-300 bg-white py-2 pl-4 pr-9 text-xs"
                >
                  {initialCase.versions.map((version) => (
                    <option key={version.id} value={version.version_no}>
                      愿景版本 {version.version_no}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-2.5 size-3" />
              </label>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:px-12">
        <section className="min-w-0">
          {latest ? (
            <DreamVisionCard vision={latest.vision} delta={latest.delta} />
          ) : (
            <div className="rounded-[2rem] border border-dashed border-stone-400 p-10 text-center">
              <p className="font-serif text-xl">
                未来还只有一个模糊轮廓。
              </p>
              <p className="mt-3 text-sm text-stone-600">
                先回答右侧问题，再生成第一张场景卡。
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-3xl border border-stone-300 bg-stone-50 p-5">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="size-4" />
              <h2 className="text-sm font-medium">把画面看清一点</h2>
            </div>
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
              {initialCase.messages.slice(-8).map((message, index) => (
                <div
                  key={index}
                  className={
                    "rounded-2xl p-3 text-xs leading-5 " +
                    (message.role === "assistant"
                      ? "bg-[#f4f1ea]"
                      : "ml-5 bg-stone-900 text-stone-50")
                  }
                >
                  {message.content}
                </div>
              ))}
            </div>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="写下你看见、听见或在意的细节……"
              className="mt-4 min-h-24 w-full rounded-2xl border border-stone-300 bg-white p-3 text-sm leading-6"
            />
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full rounded-full"
              onClick={ask}
              disabled={busy === "ask"}
            >
              {busy === "ask" ? "正在追问…" : "继续看清"}
            </Button>
            {latest && (
              <input
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="这次为什么变了（可选）"
                className="mt-4 w-full rounded-full border border-stone-300 bg-white px-3 py-2 text-xs"
              />
            )}
            <Button
              type="button"
              className="mt-2 w-full rounded-full"
              onClick={synthesize}
              disabled={busy === "vision"}
            >
              <Sparkles className="mr-2 size-4" />
              {latest ? "生成新愿景版本" : "生成第一张场景卡"}
            </Button>
          </section>

          {latest && (
            <section className="rounded-3xl border border-stone-300 bg-stone-50 p-5">
              <div className="flex items-center gap-2">
                <ScanSearch className="size-4" />
                <h2 className="text-sm font-medium">连接现状</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                只影响下一版折叠区，不改写已经形成的场景。
              </p>
              <select
                value={realityVersionId}
                onChange={(event) => setRealityVersionId(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-xs"
              >
                <option value="">选择现状地图</option>
                {realityChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.case_title} · v{choice.version_no}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 w-full rounded-full"
                onClick={attachReality}
                disabled={!realityVersionId || busy === "reality"}
              >
                作为现实来源
              </Button>
            </section>
          )}

          {(error || notice) && (
            <p
              className={
                "rounded-2xl border p-3 text-xs leading-5 " +
                (error
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700")
              }
            >
              {error ?? notice}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
