"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ISSUE_PLATFORMS, type IssueMetric, type IssuePlatform } from "@/lib/domains/signals/issue-shared";
import { saveIssueMetricAction } from "../actions";

const FIELDS = [
  { key: "views", label: "浏览" },
  { key: "likes", label: "点赞" },
  { key: "saves", label: "收藏" },
  { key: "comments", label: "评论" },
] as const;

/**
 * 这一期每一篇的数据：过几天回来看一眼平台上的数，填进来（小红书、note 都只能自己看，没有接口）。
 * 一篇只讲一件事，所以哪一篇被看得多、收藏得多，就是真实的人对哪件事更感兴趣。
 */
export function IssueMetrics({ issueId, picks, initial }: { issueId: string; picks: { headline: string }[]; initial: IssueMetric[] }) {
  const [metrics, setMetrics] = useState<IssueMetric[]>(initial);
  const [pick, setPick] = useState(0);
  const [platform, setPlatform] = useState<IssuePlatform>("小红书");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="text-base font-semibold">每一篇的数据</h2>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">
        发出去两三天后回来，看一眼平台上的数填进来（同一篇同一个平台，再填会覆盖上一次）。一篇只讲一件事 ——
        哪一篇被看得多、收藏得多，就是真实的人对哪件事更感兴趣；会算到差距清单那一条上。收藏比点赞更说明「想留着、以后可能用」。
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {picks.map((p, i) => (
          <Button key={i} size="sm" variant={pick === i ? "secondary" : "ghost"} onClick={() => setPick(i)}>
            第 {i + 1} 篇
          </Button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{picks[pick]?.headline}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ISSUE_PLATFORMS.map((p) => (
          <Button key={p} size="sm" variant={platform === p ? "secondary" : "ghost"} onClick={() => setPlatform(p)}>
            {p}
          </Button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs">
            <span className="text-muted-foreground">{f.label}</span>
            <Input
              inputMode="numeric"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/[^\d]/g, "") }))}
            />
          </label>
        ))}
      </div>
      <Button
        size="sm"
        className="mt-2"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await saveIssueMetricAction(issueId, { pick, platform, ...values });
            if (r.ok) {
              setMetrics(r.metrics);
              setValues({});
            } else setError(r.message);
          })
        }
      >
        {pending ? "在记……" : "记下"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {metrics.length > 0 && (
        <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          {[...metrics]
            .sort((a, b) => a.pick - b.pick || a.platform.localeCompare(b.platform))
            .map((m) => (
              <li key={`${m.pick}-${m.platform}`}>
                第 {m.pick + 1} 篇 · {m.platform} ·{" "}
                {FIELDS.filter((f) => m[f.key] !== null)
                  .map((f) => `${f.label} ${m[f.key]}`)
                  .join(" · ")}{" "}
                · {m.at.slice(0, 10)} 记
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
