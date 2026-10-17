import { formatYen, type KanpoNotice } from "@/lib/domains/signals/kanpo-shared";

/** 一条决算公告：第几期、决算日、总资产、当期纯损益、利益剰余金（负数写成累计亏损），附官报那一页的链接。没抽全的只给原文链接。 */
export function NoticeLine({ notice }: { notice: KanpoNotice }) {
  const link = (
    <a href={notice.pdf_url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
      官报 {notice.issue_date} {notice.issue} 第 {notice.page} 页 ↗
    </a>
  );
  if (!notice.complete) {
    return (
      <span>
        {notice.company_name ?? "这一条"}没抽全，数字看原文：{link}
      </span>
    );
  }
  const parts = [
    `${notice.period ?? ""}${notice.fiscal_end ? `（${notice.fiscal_end}）` : ""}`,
    notice.total_assets !== null ? `总资产 ${formatYen(notice.total_assets)}` : null,
    notice.net_income !== null ? `${notice.net_income < 0 ? "当期纯损失" : "当期纯利益"} ${formatYen(Math.abs(notice.net_income))}` : null,
    notice.retained_earnings !== null
      ? notice.retained_earnings < 0
        ? `累计亏损 ${formatYen(Math.abs(notice.retained_earnings))}`
        : `利益剰余金 ${formatYen(notice.retained_earnings)}`
      : null,
    notice.unit ? `（原单位${notice.unit}）` : null,
  ].filter(Boolean);
  return (
    <span>
      {parts.join(" · ")} · {link}
    </span>
  );
}
