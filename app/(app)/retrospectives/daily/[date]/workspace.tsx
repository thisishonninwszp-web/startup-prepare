"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Eye,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmDailyReflection,
  extractDailyReflection,
} from "../../actions";
import { redactJournal } from "../../privacy";
import type {
  ReflectionSettings,
  getDailyReflection,
} from "../../queries";
import {
  buildFullDaySlots,
  slotLabel,
  type DailyTimeBlock,
} from "../../types";

type Reflection = Awaited<ReturnType<typeof getDailyReflection>>;

const CATEGORY_CLASS: Record<string, string> = {
  business: "border-foreground/30 bg-foreground text-primary-foreground",
  life: "border-border bg-muted text-foreground",
  relationship: "border-status-validating/30 bg-status-validating/15 text-status-validating",
  growth: "border-status-hypothesis/30 bg-status-hypothesis/15 text-status-hypothesis",
  recovery: "border-status-mvp/30 bg-status-mvp/15 text-status-mvp",
  gray: "border-status-validating/30 bg-status-validating/15 text-status-validating",
  unknown: "border-dashed border-border bg-muted/50 text-muted-foreground/80",
};

export function DailyReflectionWorkspace({
  date,
  initialReflection,
  settings,
}: {
  date: string;
  initialReflection: Reflection;
  settings: ReflectionSettings;
}) {
  const router = useRouter();
  // rawJournal never crosses a server action boundary.
  const [rawJournal, setRawJournal] = useState("");
  const [sanitizedJournal, setSanitizedJournal] = useState(
    initialReflection?.sanitized_journal ?? ""
  );
  const [redactions, setRedactions] = useState<string[]>([]);
  const [previewed, setPreviewed] = useState(
    Boolean(initialReflection?.sanitized_journal)
  );
  const [blocks, setBlocks] = useState<DailyTimeBlock[]>(
    initialReflection?.blocks ?? []
  );
  const [ambiguities, setAmbiguities] = useState(
    initialReflection?.ambiguities ?? []
  );
  const [observation, setObservation] = useState(
    initialReflection?.fact_observation ?? ""
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timelinePreview = useMemo(() => {
    try {
      return { slots: buildFullDaySlots(blocks), error: null };
    } catch (caught) {
      return {
        slots: buildFullDaySlots([]),
        error:
          caught instanceof Error ? caught.message : "时间块暂时无法预览",
      };
    }
  }, [blocks]);
  const slots = timelinePreview.slots;

  function preview() {
    const result = redactJournal(rawJournal, settings.private_terms);
    setSanitizedJournal(result.text);
    setRedactions(result.redactions);
    setPreviewed(true);
    setError(null);
  }

  async function analyze() {
    if (!previewed || !sanitizedJournal.trim()) return;
    setBusy("analyze");
    setError(null);
    setNotice(null);
    try {
      const result = await extractDailyReflection(date, sanitizedJournal);
      setBlocks(result.blocks);
      setAmbiguities(result.ambiguities);
      setRawJournal("");
      setNotice("AI只填入了日记有依据的时段。请校正后确认。");
      router.refresh();
    } catch (caught) {
      console.error("解析每日时间镜子失败", caught);
      setError(caught instanceof Error ? caught.message : "解析失败");
    } finally {
      setBusy(null);
    }
  }

  function updateBlock(index: number, patch: Partial<DailyTimeBlock>) {
    setBlocks((current) =>
      current.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...patch } : block
      )
    );
  }

  async function confirm() {
    setBusy("confirm");
    setError(null);
    setNotice(null);
    try {
      await confirmDailyReflection({
        date,
        sanitizedJournal,
        blocks,
        ambiguities,
        factObservation: observation,
      });
      setNotice("这一天已确认。周复盘只会使用确认后的时间镜子。");
      router.refresh();
    } catch (caught) {
      console.error("确认每日时间镜子失败", caught);
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background px-4 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/retrospectives"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            返回复盘首页
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Daily time mirror
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                {date} 实际交给了什么
              </h1>
            </div>
            <span
              className={
                "rounded-full border px-3 py-1 font-mono text-[10px] " +
                (initialReflection?.status === "confirmed"
                  ? "border-status-mvp/30 bg-status-mvp/10 text-status-mvp"
                  : "bg-card text-muted-foreground")
              }
            >
              {initialReflection?.status === "confirmed" ? "CONFIRMED" : "DRAFT"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:px-12">
        <section className="space-y-6">
          <div className="rounded-lg border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <h2 className="text-sm font-medium">1. 在浏览器里遮蔽原始日记</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              原始文本只存在当前浏览器状态。只有下方确认后的遮蔽版本会发送给AI和保存。
            </p>
            <textarea
              value={rawJournal}
              onChange={(event) => {
                setRawJournal(event.target.value);
                setPreviewed(false);
              }}
              placeholder="按自然语言写下今天实际发生的事情和大致时间……"
              className="mt-4 min-h-44 w-full resize-y rounded-md border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="button" variant="outline" onClick={preview} className="mt-3">
              <Eye className="mr-2 size-4" />
              生成遮蔽预览
            </Button>
          </div>

          {previewed && (
            <div className="rounded-lg border bg-card p-5 sm:p-6">
              <h2 className="text-sm font-medium">2. 确认发送给AI的文本</h2>
              {redactions.length > 0 && (
                <p className="mt-2 text-xs text-status-validating">
                  已处理：{redactions.join("、")}
                </p>
              )}
              <textarea
                value={sanitizedJournal}
                onChange={(event) => setSanitizedJournal(event.target.value)}
                className="mt-4 min-h-36 w-full resize-y rounded-md border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="button" onClick={analyze} disabled={busy === "analyze"} className="mt-3">
                <Sparkles className="mr-2 size-4" />
                {busy === "analyze" ? "正在还原…" : "生成实际时间镜子"}
              </Button>
            </div>
          )}

          {blocks.length > 0 && (
            <div className="rounded-lg border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">3. 校正事件块</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    半小时为最小单位。没有依据的时间保持未知。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setBlocks((current) => [
                      ...current,
                      {
                        start_slot: 0,
                        end_slot: 1,
                        event: "补充事件",
                        category_key: "unknown",
                        time_basis: "approximate",
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3" />
                  补充
                </Button>
              </div>
              {ambiguities.length > 0 && (
                <div className="mt-4 rounded-md border border-status-validating/30 bg-status-validating/10 p-3">
                  <div className="text-xs font-medium text-status-validating">需要确认</div>
                  <ul className="mt-1 space-y-1 text-xs text-status-validating">
                    {ambiguities.map((item, index) => (
                      <li key={index}>· {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {timelinePreview.error && (
                <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {timelinePreview.error}
                </p>
              )}
              <div className="mt-5 space-y-3">
                {blocks.map((block, index) => (
                  <div
                    key={`${index}-${block.start_slot}`}
                    className="grid gap-2 rounded-md border p-3 sm:grid-cols-[7rem_7rem_1fr_8rem_auto]"
                  >
                    <SlotSelect
                      value={block.start_slot}
                      max={47}
                      onChange={(value) => updateBlock(index, { start_slot: value })}
                    />
                    <SlotSelect
                      value={block.end_slot}
                      min={1}
                      max={48}
                      onChange={(value) => updateBlock(index, { end_slot: value })}
                    />
                    <input
                      value={block.event}
                      onChange={(event) => updateBlock(index, { event: event.target.value })}
                      className="rounded-md border bg-background px-2 py-1.5 text-xs"
                    />
                    <select
                      value={block.category_key}
                      onChange={(event) =>
                        updateBlock(index, { category_key: event.target.value })
                      }
                      className="rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      {settings.categories.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      onClick={() =>
                        setBlocks((current) =>
                          current.filter((_, blockIndex) => blockIndex !== index)
                        )
                      }
                      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                      aria-label="删除事件块"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blocks.length > 0 && (
            <div className="rounded-lg border bg-card p-5 sm:p-6">
              <h2 className="text-sm font-medium">4. 留下一句事实观察</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                不写计划，不评价自己。只写今天真正发生了什么。
              </p>
              <textarea
                value={observation}
                onChange={(event) => setObservation(event.target.value)}
                placeholder="例如：我说顾客接触最重要，但今天没有留出实际联系时间。"
                className="mt-4 min-h-24 w-full rounded-md border bg-background p-3 text-sm"
              />
              <Button
                type="button"
                onClick={confirm}
                disabled={busy === "confirm" || !observation.trim()}
                className="mt-3"
              >
                <Check className="mr-2 size-4" />
                {busy === "confirm" ? "确认中…" : "确认这一天"}
              </Button>
            </div>
          )}

          {(error || notice) && (
            <p
              role={error ? "alert" : "status"}
              className={
                "rounded-md border p-3 text-sm " +
                (error
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-status-mvp/30 bg-status-mvp/10 text-status-mvp")
              }
            >
              {error ?? notice}
            </p>
          )}
        </section>

        <aside>
          <div className="sticky top-6 rounded-lg border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">24小时镜子</h2>
              <span className="font-mono text-[10px] text-muted-foreground">
                30 MIN / ROW
              </span>
            </div>
            <div className="mt-5 grid grid-cols-[3rem_1fr] gap-x-2">
              <div className="grid grid-rows-[repeat(48,1.25rem)]">
                {slots.map((slot) => (
                  <div key={slot.slot} className="font-mono text-[9px] text-muted-foreground">
                    {slot.slot % 2 === 0 ? slotLabel(slot.slot) : ""}
                  </div>
                ))}
              </div>
              <div className="relative grid grid-rows-[repeat(48,1.25rem)] overflow-hidden rounded-md border bg-muted/50">
                {slots.map((slot) => (
                  <div key={slot.slot} className="border-b border-border/70" />
                ))}
                {blocks.map((block, index) => (
                  <div
                    key={index}
                    style={{
                      gridRow: `${block.start_slot + 1} / ${block.end_slot + 1}`,
                    }}
                    className={
                      "z-10 mx-1 overflow-hidden rounded border px-2 py-1 text-[10px] leading-4 " +
                      (CATEGORY_CLASS[block.category_key] ??
                        "border-border bg-white text-foreground")
                    }
                  >
                    <div className="font-medium">{block.event}</div>
                    <div className="opacity-60">
                      {slotLabel(block.start_slot)}—{slotLabel(block.end_slot)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function SlotSelect({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
    >
      {Array.from({ length: max - min + 1 }, (_, index) => index + min).map(
        (slot) => (
          <option key={slot} value={slot}>
            {slotLabel(slot)}
          </option>
        )
      )}
    </select>
  );
}
