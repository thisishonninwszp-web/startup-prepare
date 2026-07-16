"use client";

import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resetReflectionCategories,
  saveReflectionSettings,
} from "../actions";
import type { ReflectionSettings } from "../queries";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function ReflectionSettingsForm({
  initial,
}: {
  initial: ReflectionSettings;
}) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [weekday, setWeekday] = useState(initial.review_weekday);
  const [categories, setCategories] = useState(initial.categories);
  const [grayKeywords, setGrayKeywords] = useState(
    initial.gray_keywords.join("\n")
  );
  const [privateTerms, setPrivateTerms] = useState(
    initial.private_terms.join("\n")
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await saveReflectionSettings({
        timezone,
        reviewWeekday: weekday,
        categories,
        grayKeywords: grayKeywords.split("\n"),
        privateTerms: privateTerms.split("\n"),
      });
      setMessage("复盘协议已保存");
    } catch (caught) {
      console.error("保存复盘设置失败", caught);
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 space-y-8">
      <section className="rounded-lg border bg-card p-5 sm:p-6">
        <h2 className="text-sm font-medium">周期</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            时区
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            每周复盘日
            <select
              value={weekday}
              onChange={(event) => setWeekday(Number(event.target.value))}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
            >
              {WEEKDAYS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">时间分类</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              `unknown` 是诚实边界，必须保留。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setCategories((current) => [
                ...current,
                {
                  key: `custom_${current.length + 1}`,
                  label: "新分类",
                  color: "zinc",
                },
              ])
            }
          >
            <Plus className="mr-1 size-3" />
            添加
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {categories.map((category, index) => (
            <div
              key={`${category.key}-${index}`}
              className="grid grid-cols-[1fr_1fr_auto] gap-2"
            >
              <input
                value={category.key}
                disabled={category.key === "unknown"}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, key: event.target.value }
                        : item
                    )
                  )
                }
                className="rounded-md border bg-background px-3 py-2 font-mono text-xs disabled:bg-muted"
              />
              <input
                value={category.label}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item
                    )
                  )
                }
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                disabled={category.key === "unknown"}
                onClick={() =>
                  setCategories((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-20"
                aria-label="删除分类"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={async () => {
            setError(null);
            try {
              await resetReflectionCategories();
              window.location.reload();
            } catch (caught) {
              console.error("恢复默认时间分类失败", caught);
              setError(caught instanceof Error ? caught.message : "恢复失败");
            }
          }}
        >
          <RotateCcw className="mr-1 size-3" />
          恢复默认分类
        </Button>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <label className="rounded-lg border bg-card p-5 text-sm">
          <span className="font-medium">灰色时间关键词</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            每行一个。只有事件文字命中这些规则时才标成灰色。
          </span>
          <textarea
            value={grayKeywords}
            onChange={(event) => setGrayKeywords(event.target.value)}
            placeholder={"刷短视频\n无意识浏览"}
            className="mt-4 min-h-32 w-full rounded-md border bg-background p-3 text-sm"
          />
        </label>
        <label className="rounded-lg border bg-card p-5 text-sm">
          <span className="font-medium">日记遮蔽词典</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            每行一个人名或私人词。原文仍只留在浏览器。
          </span>
          <textarea
            value={privateTerms}
            onChange={(event) => setPrivateTerms(event.target.value)}
            placeholder={"某位同事姓名\n私人地点"}
            className="mt-4 min-h-32 w-full rounded-md border bg-background p-3 text-sm"
          />
        </label>
      </section>

      {(message || error) && (
        <p
          className={
            "rounded-md border p-3 text-sm " +
            (error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-status-mvp/30 bg-status-mvp/10 text-status-mvp")
          }
        >
          {error ?? message}
        </p>
      )}
      <Button type="button" onClick={save} disabled={busy}>
        {busy ? "保存中…" : "保存复盘协议"}
      </Button>
    </div>
  );
}
