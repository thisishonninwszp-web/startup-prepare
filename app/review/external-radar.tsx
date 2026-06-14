"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  scanExternalSignals,
  ingestUrl,
  createObservation,
} from "../capture/actions";
import { EXTERNAL_TAG, type ExternalSignal } from "../ideas/types";

type Mode = "topic" | "url";

export function ExternalRadar({ enabled }: { enabled: boolean }) {
  const [mode, setMode] = useState<Mode>("topic");
  const [input, setInput] = useState("");
  const [signals, setSignals] = useState<ExternalSignal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  async function scan() {
    const q = input.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setSaved({});
    try {
      const r = mode === "url" ? await ingestUrl(q) : await scanExternalSignals(q);
      setSignals(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  async function save(i: number, s: ExternalSignal) {
    try {
      await createObservation(s.text, [EXTERNAL_TAG]);
      setSaved((p) => ({ ...p, [i]: true }));
    } catch {
      setError("存为观察失败，请重试");
    }
  }

  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-sm font-medium">外部雷达</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          只有自己的感受不够。联网拉一点产业/政策/竞品的真实动态，挑相关的存成观察——它会进入你的发现管线，不是看完即忘的资讯流。
        </p>
      </div>

      {!enabled ? (
        <p className="mt-4 text-sm text-muted-foreground">
          配置 <span className="font-mono">TAVILY_API_KEY</span> 后启用（tavily.com 有免费额度）。
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(["topic", "url"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                    (mode === m
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted")
                  }
                >
                  {m === "topic" ? "按主题" : "粘贴链接"}
                </button>
              ))}
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void scan();
                }
              }}
              placeholder={
                mode === "topic"
                  ? "一个产业 / 政策 / 方向关键词"
                  : "粘贴一篇文章链接"
              }
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button onClick={scan} disabled={loading || !input.trim()}>
              {loading ? "扫描中…" : "扫描外部"}
            </Button>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {signals && signals.length === 0 && !loading && (
            <p className="mt-4 text-sm text-muted-foreground">
              没拉到有依据的动态。换个更具体的主题或链接再试。
            </p>
          )}

          {signals && signals.length > 0 && (
            <ul className="mt-4 space-y-2">
              {signals.map((s, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap">{s.text}</p>
                    {saved[i] ? (
                      <span className="shrink-0 text-xs text-green-600">
                        已存 ✓
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => save(i, s)}
                        className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      >
                        存为观察
                      </button>
                    )}
                  </div>
                  {s.why && (
                    <p className="mt-1 text-xs text-muted-foreground">{s.why}</p>
                  )}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block max-w-full truncate text-xs text-primary underline-offset-4 hover:underline"
                    >
                      来源 ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
