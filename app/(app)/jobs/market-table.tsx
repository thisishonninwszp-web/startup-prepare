import Link from "next/link";
import { EFFECTIVE_LABELS, JOB_CATEGORIES, RATIO_MIN_APPLICATIONS, type MarketRow } from "@/lib/domains/jobs/shared";

/** 四类各一行，只数次数；点开看是哪几家。满 5 家才给"回了"的比例，四类之间不合计。 */
export function MarketTable({ rows }: { rows: MarketRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <details key={row.category} className="rounded-lg border border-border p-3 text-sm leading-7">
          <summary className="cursor-pointer">
            <span className="font-medium">{JOB_CATEGORIES[row.category]}</span>
            <span className="ml-2 text-muted-foreground">
              {row.applied === 0
                ? "还没投"
                : `投了 ${row.applied} 家，回了 ${row.replied}${row.replyRate !== null ? `（${row.replyRate}%）` : ""}，约面试 ${row.interview}，不录用 ${row.rejected}，没回音 ${row.noReply}`}
            </span>
            {row.salaryRange && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                对方提的年收 {row.salaryRange[0]}–{row.salaryRange[1]} 万
              </span>
            )}
          </summary>
          {row.applied > 0 && row.applied < RATIO_MIN_APPLICATIONS && (
            <p className="mt-1 text-xs text-muted-foreground">不到 {RATIO_MIN_APPLICATIONS} 家，先只数次数，不算比例。</p>
          )}
          {row.apps.length > 0 && (
            <ul className="mt-2 space-y-1">
              {row.apps.map((a) => (
                <li key={a.posting_id}>
                  <Link href={`/jobs/${a.posting_id}`} className="underline-offset-4 hover:underline">
                    {a.company_name} · {a.title}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {EFFECTIVE_LABELS[a.effective]}
                    {a.offered_salary !== null ? ` · 对方提 ${a.offered_salary} 万` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}
