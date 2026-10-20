"use client";

import { useState } from "react";

// 画布窄一点：手机上缩放得少，坐标字不至于小到看不清
const W = 460;
const H = 150;
const PAD = { left: 34, right: 44, top: 12, bottom: 24 };

function compact(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/** 把最大值往上取到好读的整数（120 → 150，830 → 1000）。 */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 3 ? 3 : m <= 5 ? 5 : 10) * p;
}

/**
 * 每月一个数的折线（只有一条线，用主色；不画图例，标题说了画的是什么）。
 * 2px 线、10% 的浅底；末端写最后一个月的数；鼠标移上去有竖线对准最近的那个月，提示写这个月几次。
 * split：从第几个点开始是"最近 12 个月"，画一条细线分开两段，方便比"最近 12 个月"和"再往前 12 个月"。
 * 下面「看每个月的数」是同样的数的表 —— 提示框只是方便，不是唯一能看到数的地方。
 */
export function MonthLine({
  title,
  points,
  unit,
  split,
}: {
  title: string;
  points: { month: string; value: number }[];
  unit: string;
  split?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = points[points.length - 1];
  const h = hover !== null ? points[hover] : null;
  // 长的线（两年半以上）在每年一月标年份，最多六个；离头尾两个月份太近的不标，免得字叠在一起
  const januaries = points.length > 30 ? points.flatMap((p, i) => (p.month.endsWith("-01") ? [{ i, year: Number(p.month.slice(0, 4)) }] : [])) : [];
  const every = Math.max(1, Math.ceil(januaries.length / 6));
  const yearTicks = januaries.filter((t) => t.year % every === 0 && x(t.i) - x(0) > 66 && x(points.length - 1) - x(t.i) > 66);

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="text-xs">
      <figcaption className="mb-1 text-sm font-medium">{title}</figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${title}：最后一个月（${last.month}）${last.value} ${unit}`}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          {/* 横向参考线：0、一半、最大，细、灰 */}
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="text-border" stroke="currentColor" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground" fontSize={12}>
                {compact(v)}
              </text>
            </g>
          ))}
          {split !== undefined && split > 0 && split < points.length && (
            <g>
              <line x1={x(split) - 0.5 * ((W - PAD.left - PAD.right) / (points.length - 1))} x2={x(split) - 0.5 * ((W - PAD.left - PAD.right) / (points.length - 1))} y1={PAD.top} y2={y(0)} className="text-border" stroke="currentColor" strokeWidth={1} />
              <text x={x(split)} y={PAD.top + 10} className="fill-muted-foreground" fontSize={12}>
                最近 12 个月
              </text>
            </g>
          )}
          <path d={area} className="text-primary" fill="currentColor" fillOpacity={0.1} />
          <path d={line} className="text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* 末端的点和数 */}
          <circle cx={x(points.length - 1)} cy={y(last.value)} r={4} className="fill-primary stroke-background" strokeWidth={2} />
          <text x={x(points.length - 1) + 8} y={y(last.value) + 4} className="fill-foreground" fontSize={12}>
            {compact(last.value)}
          </text>
          {yearTicks.map((t) => (
            <text key={t.year} x={x(t.i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>
              {t.year}
            </text>
          ))}
          {/* 横轴：头、尾两个月 */}
          <text x={x(0)} y={H - 6} className="fill-muted-foreground" fontSize={12}>
            {points[0].month}
          </text>
          <text x={x(points.length - 1)} y={H - 6} textAnchor="end" className="fill-muted-foreground" fontSize={12}>
            {last.month}
          </text>
          {hover !== null && h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} className="text-muted-foreground" stroke="currentColor" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(h.value)} r={4} className="fill-primary stroke-background" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hover !== null && h && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-card px-2 py-1 shadow-sm"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > points.length / 2 ? "translateX(-105%)" : "translateX(5%)" }}
          >
            <span className="font-mono font-semibold text-foreground">
              {h.value.toLocaleString("ja-JP")} {unit}
            </span>
            <span className="ml-1 text-muted-foreground">{h.month}</span>
          </div>
        )}
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-muted-foreground">看每个月的数</summary>
        <ul className="mt-1 grid grid-cols-3 gap-x-4 font-mono text-muted-foreground sm:grid-cols-4">
          {points.map((p) => (
            <li key={p.month}>
              {p.month}：{p.value.toLocaleString("ja-JP")}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
