"use client";

import { Button } from "@/components/ui/button";
import { MonthLine } from "@/components/ui/month-line";
import { attentionSeries, monthlyGrowth, monthlyPoints, POINT_LABELS, REMEASURE_DAYS, type GapVoices } from "@/lib/domains/signals/voices-shared";

/**
 * 量过的每一次：楽天评价、App 评分人数、YouTube、はてな没有现成的历史，只能隔一阵量一次自己攒。
 * 两次以上出表（越攒越多的那两样在数后面写比上一次多了几条）；那两样攒到三个月以上，画"每个月多了几条"的线
 * （每个月取最后一次量的数）。只数，不算涨了百分之几。
 */
export function MeasureHistory({ voices, pending, onRemeasure }: { voices: GapVoices; pending: boolean; onRemeasure: () => void }) {
  const series = attentionSeries(voices);
  const cols = POINT_LABELS.filter((c) => series.some((p) => typeof p[c.key] === "number"));
  const lines = cols
    .filter((c) => c.grows)
    .map((c) => ({ c, points: monthlyGrowth(monthlyPoints(series, c.key)) }))
    .filter((l) => l.points.length >= 2);
  const last = voices.attention?.checked_at ?? null;
  const days = last ? Math.max(0, Math.floor((Date.now() - Date.parse(last)) / 86_400_000)) : null;

  return (
    <div className="mt-3 rounded-md border border-border p-3 text-xs leading-6">
      <p className="text-sm font-medium">量过几次（攒起来看是在变多还是变少）</p>
      {series.length > 1 && cols.length > 0 && (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full whitespace-nowrap font-mono">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-normal">哪天量的</th>
                {cols.map((c) => (
                  <th key={c.key} title={c.label} className="py-1 pr-3 text-right font-normal">
                    {c.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((p, i) => (
                <tr key={p.at} className="border-t border-border">
                  <td className="py-1 pr-3 text-muted-foreground">{p.at.slice(0, 10)}</td>
                  {cols.map((c) => {
                    const v = p[c.key];
                    const before = i > 0 ? series[i - 1][c.key] : undefined;
                    return (
                      <td key={c.key} className="py-1 pr-3 text-right">
                        {typeof v === "number" ? v.toLocaleString("ja-JP") : "—"}
                        {c.grows && typeof v === "number" && typeof before === "number" && (
                          <span className="ml-1 text-muted-foreground">
                            {v >= before ? "+" : "−"}
                            {Math.abs(v - before).toLocaleString("ja-JP")}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines.map((l) => (
        <div key={l.c.key} className="mt-3">
          <MonthLine title={`${l.c.label}：每个月比上一次量多了几${l.c.unit}`} points={l.points} unit={l.c.unit} />
        </div>
      ))}
      <p className="mt-1 text-muted-foreground">
        维基、Google 趋势、家计调查有现成的历史（上面的线）；楽天的评价、App 评分人数、YouTube、はてな没有，只能隔一阵量一次自己攒。
        {days !== null && `上次量是${days === 0 ? "今天" : ` ${days} 天前`}`}
        {days !== null && (days >= REMEASURE_DAYS ? "，可以再量一次了。" : `，隔 ${REMEASURE_DAYS} 天以上再量，多出来的那个点才有用。`)}
        评价、评分人数只会越攒越多，看的是比上一次多了几条 —— 多得快，说明最近还有不少人在买、在用。楽天前 30 件换了几件时总数会变少，线上记成 0。
      </p>
      <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" disabled={pending} onClick={onRemeasure}>
        {pending ? "在量……十几秒" : "只再量一次这几个数（十几秒，不重新找原话）"}
      </Button>
    </div>
  );
}
