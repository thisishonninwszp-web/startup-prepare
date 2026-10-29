import { z } from "zod";
import type { CompanyActivity, CompanyEntry } from "./domain";

const detailSchema = z.object({
  subject: z.string().trim().min(1).max(200), valueText: z.string().trim().min(1).max(1000),
  region: z.string().trim().min(1).max(100), unit: z.string().trim().max(100).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
}).strict();
export type SnapshotDetails = z.infer<typeof detailSchema>;
export function snapshotDetails(input: unknown, quote: string): SnapshotDetails & { status: "success" } {
  const parsed = detailSchema.parse(input);
  if (!quote.includes(parsed.valueText)) throw new Error("结构化值必须能在逐字摘录中核对；没有材料时保留未知。");
  return { ...parsed, status: "success" };
}

export type SnapshotComparison = { comparable: boolean; reason: string; change: "same" | "text_changed" | "unknown"; leftValue: string | null; rightValue: string | null };
export function compareCompanySnapshots(left: CompanyEntry, right: CompanyEntry): SnapshotComparison {
  const no = (reason: string): SnapshotComparison => ({ comparable: false, reason, change: "unknown", leftValue: null, rightValue: null });
  if (left.kind !== "snapshot" || right.kind !== "snapshot" || left.company_id !== right.company_id || left.user_id !== right.user_id) return no("仅比较同一企业档案中的两份快照。");
  const a = left.payload as unknown as CompanyActivity, b = right.payload as unknown as CompanyActivity;
  if (!a.source || !b.source || !a.details || !b.details || a.details.status !== "success" || b.details.status !== "success") return no("失败或缺失捕获不代表降价、下架或功能移除。");
  let x: SnapshotDetails, y: SnapshotDetails;
  try { x = detailSchema.parse({ subject:a.details.subject, valueText:a.details.valueText, region:a.details.region, unit:a.details.unit, currency:a.details.currency }); y = detailSchema.parse({ subject:b.details.subject, valueText:b.details.valueText, region:b.details.region, unit:b.details.unit, currency:b.details.currency }); }
  catch { return no("产品、字段或结构化口径尚不完整，请先核对原文。"); }
  if (!a.source.url || a.source.url !== b.source.url || a.source.scope !== b.source.scope || a.type !== b.type || !["price", "feature"].includes(a.type)) return no("来源URL、捕获范围或字段不同，不能直接比较。");
  if (x.subject !== y.subject || x.region !== y.region || x.unit !== y.unit || x.currency !== y.currency) return no("产品/方案、地区、单位或币种不同，不能直接比较。");
  if (a.type === "price" && (!x.unit || !x.currency || !y.unit || !y.currency)) return no("价格的单位或币种未知，不能推断价格变化。");
  if (!a.source.rawText.includes(a.source.quote) || !b.source.rawText.includes(b.source.quote) || !a.source.quote.includes(x.valueText) || !b.source.quote.includes(y.valueText)) return no("结构化值与已保存原文不一致。");
  return { comparable: true, reason: "口径一致，可核对所选文字的变化；不自动判断价格方向、功能效果或客户需求。", change: x.valueText === y.valueText ? "same" : "text_changed", leftValue: x.valueText, rightValue: y.valueText };
}
