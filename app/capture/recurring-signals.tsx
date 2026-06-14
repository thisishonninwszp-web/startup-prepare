"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  findRecurringSignals,
  draftDirectionFromTheme,
  type RecurringSignal,
} from "./actions";
import { createIdeaFromTheme, promoteObservationToIdea } from "../ideas/actions";
import type { DirectionDraft } from "../ideas/types";

export function RecurringSignals() {
  const [signals, setSignals] = useState<RecurringSignal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 按主题 repId 维护各自的草稿 / 建库状态
  const [drafts, setDrafts] = useState<Record<string, DirectionDraft>>({});
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [builtId, setBuiltId] = useState<Record<string, string>>({});
  const [promoted, setPromoted] = useState<Record<string, boolean>>({});

  async function scan() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setSignals(await findRecurringSignals());
    } catch (e) {
      setError(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  async function draft(s: RecurringSignal) {
    if (draftingId) return;
    setDraftingId(s.repId);
    setError(null);
    try {
      const d = await draftDirectionFromTheme(s.theme, s.sampleTexts);
      setDrafts((prev) => ({ ...prev, [s.repId]: d }));
    } catch {
      setError("逼成方向失败，请重试");
    } finally {
      setDraftingId(null);
    }
  }

  async function build(s: RecurringSignal) {
    const d = drafts[s.repId];
    if (!d || buildingId) return;
    setBuildingId(s.repId);
    setError(null);
    try {
      const idea = await createIdeaFromTheme(
        s.theme,
        { ...d.hypothesis, riskiest_assumption: d.riskiest_assumption },
        []
      );
      setBuiltId((prev) => ({ ...prev, [s.repId]: idea.id }));
    } catch {
      setError("建为想法失败，请重试");
    } finally {
      setBuildingId(null);
    }
  }

  async function promote(repId: string) {
    try {
      await promoteObservationToIdea(repId);
      setPromoted((p) => ({ ...p, [repId]: true }));
    } catch {
      setError("提升失败，请重试");
    }
  }

  return (
    <section className="mx-auto mt-10 max-w-2xl border-t pt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">反复信号</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            你的大脑会忽略自己的重复模式。让 AI 找出反复主题，并逼成可证伪的方向。
          </p>
        </div>
        <Button variant="outline" onClick={scan} disabled={loading}>
          {loading ? "扫描中…" : signals ? "重新扫描" : "找出反复信号"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {signals && signals.length === 0 && !loading && (
        <p className="mt-4 text-sm text-muted-foreground">
          暂时没有反复出现的信号。继续记录，模式会慢慢浮现。
        </p>
      )}

      {signals && signals.length > 0 && (
        <ul className="mt-4 space-y-2">
          {signals.map((s) => {
            const d = drafts[s.repId];
            const built = builtId[s.repId];
            return (
              <li
                key={s.repId}
                className="rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{s.theme}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {s.count} 次
                    </span>
                    {s.painCount > 0 && (
                      <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700">
                        {s.painCount} 条带真痛信号
                      </span>
                    )}
                  </div>

                  {built ? (
                    <Link
                      href={`/ideas/${built}`}
                      className="shrink-0 text-xs text-green-600 underline-offset-4 hover:underline"
                    >
                      已建为想法 ✓ 打开 →
                    </Link>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      {!promoted[s.repId] && (
                        <button
                          type="button"
                          onClick={() => promote(s.repId)}
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        >
                          直接提升
                        </button>
                      )}
                      {promoted[s.repId] && (
                        <span className="text-xs text-green-600">已提升 ✓</span>
                      )}
                      <button
                        type="button"
                        onClick={() => draft(s)}
                        disabled={draftingId === s.repId}
                        className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {draftingId === s.repId ? "逼问中…" : d ? "重逼一次" : "逼成方向"}
                      </button>
                    </div>
                  )}
                </div>

                {s.sampleText && !d && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    例：{s.sampleText}
                  </p>
                )}

                {d && (
                  <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3 text-sm">
                    <Sentence h={d.hypothesis} />
                    {d.riskiest_assumption && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          最关键假设（错了就死）
                        </div>
                        <p className="mt-0.5">{d.riskiest_assumption}</p>
                      </div>
                    )}
                    {d.week_check && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          本周怎么初判生死
                        </div>
                        <p className="mt-0.5">{d.week_check}</p>
                      </div>
                    )}
                    {!built && (
                      <Button
                        onClick={() => build(s)}
                        disabled={buildingId === s.repId}
                      >
                        {buildingId === s.repId ? "建立中…" : "建为想法"}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Sentence({ h }: { h: DirectionDraft["hypothesis"] }) {
  const v = (s: string | undefined) => (
    <span className={s ? "text-foreground" : "text-muted-foreground/50"}>
      {s || "____"}
    </span>
  );
  return (
    <p className="leading-relaxed">
      {v(h.target_user)} 有 {v(h.pain)}，现在用 {v(h.alternative)} 解决，但{" "}
      {v(h.why_insufficient)}，如果有 {v(h.solution)}，愿意付{" "}
      {v(h.willingness_to_pay)}。
    </p>
  );
}
