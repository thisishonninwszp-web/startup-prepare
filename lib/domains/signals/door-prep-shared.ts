/**
 * 假门 AI 先做好（经用户同意，2026-10-23）：他朋友圈小，"愿付钱"的证据只能靠陌生人看着价格留邮箱；
 * 可 14 条差距里只听过 1 条、一个假门也没开过 —— 每一步都要他点进去、想、填。
 * 改成后台一天做一步：先给最新一条没听过的差距「听一听」；原话够了，就把假门那一页写好、价格按数据先填一个，
 * 放进一分钟清单，他看过点「发布」或「不要」。这里是不碰数据库的部分。
 */
import type { GapSide } from "./gaps-shared";
import type { FakeDoorDraft } from "./fake-door-shared";
import type { Attention } from "./attention-shared";
import { VOICES_FOR_DOOR } from "./act-shared";

/** 原话听到几句以上才做假门（和本周行动「该开假门了」同一个门槛）。 */
export { VOICES_FOR_DOOR };
/** 两次自动「听一听」至少隔多久（小时）：一天一条，不刷钱。 */
export const LISTEN_EVERY_HOURS = 20;

/** 做好了、还没发布的假门（存在那一条的听一听结果里，analysis.door_draft）。 */
export type DoorDraftPrep = {
  draft: FakeDoorDraft;
  /** 代码按数据先填的价格（"1,280円"）；没有数据是 null，要他自己填。 */
  price: string | null;
  /** 价格从哪来的一句话（页面上写在价格旁边）。 */
  price_basis: string | null;
  made_at: string;
  /** 他点了「不要」：不再放进清单，也不再为这一条做。 */
  dismissed_at?: string;
};

type GapLite = { side: GapSide; signal_id: string; quotes: number | null; door: unknown | null };

/** 下一条自动「听一听」的：没听过的里排在最前的那条（差距清单本来就是新的在前）。 */
export function pickListenGap<T extends GapLite>(gaps: T[]): T | null {
  return gaps.find((g) => g.quotes === null) ?? null;
}

/** 下一条该做假门的：原话够了、还没开假门、还没做过（或者没被他说不要）的，原话多的先。 */
export function pickDoorGap<T extends GapLite>(gaps: T[], prepared: (g: T) => boolean): T | null {
  return gaps.filter((g) => !g.door && (g.quotes ?? 0) >= VOICES_FOR_DOOR && !prepared(g)).sort((a, b) => (b.quotes ?? 0) - (a.quotes ?? 0))[0] ?? null;
}

/**
 * 先填的价格：日文页（日本这边的陌生人）用楽天上同类商品的价格中位数，写明出处；中文页、没有楽天数据的不填。
 * 不让 AI 想价格（假门的规矩：不许编价格）。楽天是买一次的价格，按月收费的服务要他自己改。
 */
export function suggestedPrice(attention: Attention | undefined, lang: "ja" | "zh"): { price: string; basis: string } | null {
  if (lang !== "ja" || !attention) return null;
  const r = attention.rakuten;
  if (!r || r === "no-key" || "error" in r || !r.medianPrice || r.medianPrice <= 0) return null;
  return {
    price: `${r.medianPrice.toLocaleString("ja-JP")}円`,
    basis: `楽天上「${attention.topic}」相关商品前 30 件价格的中位数（买一次的价格；要是按月收费，改成「月額 …円」）`,
  };
}
