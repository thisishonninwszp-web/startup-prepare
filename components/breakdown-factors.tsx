import type { Breakdown } from "@/lib/domains/signals/breakdown-shared";

/** 查不到「现在」时，拆解那一步填的就是这句。 */
const NOT_FOUND = "没查到现在的情况。";

/**
 * 「从这几样想起」（经用户同意，2026-10-24：光让他做题、连思路都没有，等于纯猜）：
 * 摆在题目下面、AI 的判断前面，清单页和网站共用。只读、不带按钮 —— 每样往哪边偏，他心里过一遍就行。
 * 因素名和怎么起作用（两个方向的条件句）一直摆着；「现在」是上网查的、原文核对过，查不到就只说去哪看；原文折起来。
 */
export function BreakdownFactors({ breakdown }: { breakdown: Breakdown }) {
  if (breakdown.factors.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-border bg-background p-3">
      <p className="text-sm font-medium">从这几样想起</p>
      <p className="text-xs leading-6 text-muted-foreground">这件事主要看这几样。每样现在往哪边偏、哪样更重，你过一遍再判 —— 这里不说方向。</p>
      <ol className="mt-2 space-y-3">
        {breakdown.factors.map((f, i) => {
          const found = f.basis.length > 0 && f.now !== NOT_FOUND;
          return (
            <li key={i} className="text-sm leading-7">
              <p className="font-medium">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                {f.factor}
              </p>
              <p>{f.mechanism}</p>
              {found ? (
                <>
                  <p>
                    <span className="text-muted-foreground">现在：</span>
                    {f.now}
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">原文 · 以后去哪看</summary>
                    <ul className="mt-1 space-y-1 text-muted-foreground">
                      {f.basis.map((b, j) => (
                        <li key={j}>
                          「{b.excerpt}」
                          <a href={b.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                            {b.title || "来源"} ↗
                          </a>
                        </li>
                      ))}
                      <li>以后去哪看：{f.indicator}</li>
                    </ul>
                  </details>
                </>
              ) : (
                <p className="text-xs leading-6 text-muted-foreground">现在怎样没查到，去这里看：{f.indicator}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
