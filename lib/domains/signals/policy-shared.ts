import { daysBetween } from "./forecast-shared";

/**
 * 日本政策的「流水线」（迁移 097）—— 不碰数据库、不碰网络的部分：
 * 解析 e-Gov 意见征集的订阅、标出跟他有关的、数「截止 → 公布」「公布 → 施行」的历史、政策题的门槛和统计基准。
 */

export type PolicyItem = {
  id: string;
  title: string;
  ministry: string | null;
  category: string | null;
  notice_date: string | null;
  deadline: string | null;
  result_date: string | null;
  promulgate_date: string | null;
  comments: number | null;
  url: string;
};

const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** 「2026/10/21」「2026/11/20 17:00」→ 2026-10-21；空的、认不出的 → null。 */
function day(v: string | undefined): string | null {
  const m = (v ?? "").match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

/** 问合先「厚生労働省医薬局……」里取部委名。 */
export function ministryOf(contact: string): string | null {
  const m = contact.trim().match(/^(.*?(?:省|庁|委員会|内閣府|内閣官房|会議|院))/);
  return m ? m[1] : null;
}

/** e-Gov 意见征集的订阅（「正在征求意见」和「结果公示」两个都是这个格式）。 */
export function parsePcmRss(xml: string): PolicyItem[] {
  const out: PolicyItem[] = [];
  for (const m of Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g))) {
    const body = m[1];
    const tag = (name: string) => unescape((body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) ?? [])[1] ?? "").trim();
    const link = tag("link");
    const id = (link.match(/[?&]id=(\d+)/) ?? [])[1];
    const title = tag("title");
    if (!id || !title) continue;
    const fields = new Map(
      tag("description")
        .split(/<br\s*\/?>/)
        .map((line) => line.split("："))
        .filter((kv) => kv.length >= 2)
        .map(([k, ...v]) => [k.trim(), v.join("：").trim()] as const)
    );
    const comments = Number(fields.get("提出意見数"));
    out.push({
      id,
      title,
      ministry: ministryOf(fields.get("問合せ先（所管省庁・部局名等）") ?? ""),
      category: fields.get("カテゴリー") || null,
      notice_date: day(fields.get("案の公示日")),
      deadline: day(fields.get("受付締切日時")),
      result_date: day(fields.get("結果の公示日")),
      promulgate_date: day(fields.get("命令等の公布日")),
      comments: Number.isFinite(comments) && fields.has("提出意見数") ? comments : null,
      url: link,
    });
  }
  return out;
}

/** 结果页（PCM1040）上的「対象が定められた日」（= 公布日）和「結果の公示日」；不是结果页（还没结果）返回 null。 */
export function parseResultPage(text: string): { result_date: string | null; promulgate_date: string | null } | null {
  const t = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (!t.includes("結果の公示日")) return null;
  const pick = (label: string) => {
    const m = t.match(new RegExp(`${label}\\s*(\\d{4})年(\\d{1,2})月(\\d{1,2})日`));
    return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
  };
  return { result_date: pick("結果の公示日"), promulgate_date: pick("対象が定められた日") };
}

/**
 * 他关心的方向：在日本做生意会碰到的规则（外国人、雇人、护理、民宿、支付、运输、个人信息、电商……）。
 * 太泛的词不用：「労働」会把厚生労働省的每一件都算进来，「食品」会算进农药残留标准（2026-10-23 拿线上订阅试过）。
 */
const RELEVANT = /外国人|在留|出入国|入管|技能実習|育成就労|特定技能|労働者派遣|職業紹介|最低賃金|労働基準法|介護|家事|保育|旅館業|民泊|住宅宿泊|観光|インバウンド|資金決済|暗号資産|電子マネー|キャッシュレス|割賦|飲食店|食品衛生法|物流|運送事業|貨物自動車|タクシー|ライドシェア|自動運転|個人情報|AI|人工知能|電子商取引|通信販売|特定商取引|景品表示|宅地建物|中小企業|スタートアップ|創業|補助金|会社法|インボイス/;

export function isRelevantPolicy(title: string): boolean {
  return RELEVANT.test(title);
}

/** 他关心的那几部法律（历次修改的公布、施行日从 e-Gov 法令 API 取，当「公布 → 施行」的基准）。 */
export const WATCHED_LAWS = [
  "出入国管理及び難民認定法",
  "労働基準法",
  "職業安定法",
  "労働者派遣事業の適正な運営の確保及び派遣労働者の保護等に関する法律",
  "介護保険法",
  "旅館業法",
  "住宅宿泊事業法",
  "資金決済に関する法律",
  "道路運送法",
  "貨物自動車運送事業法",
  "食品衛生法",
  "特定商取引に関する法律",
  "個人情報の保護に関する法律",
  "建築基準法",
  "宅地建物取引業法",
  "電気通信事業法",
  "割賦販売法",
  "古物営業法",
  "会社法",
  "消費税法",
];

export type LagSummary = { n: number; median: number | null; same: number; within6m: number; within1y: number; longer: number };

/** 一组时差（天）：几件、中位数、当天就生效 / 半年内 / 一年内 / 更久的各几件（只数次数）。 */
export function lagSummary(days: number[]): LagSummary {
  const xs = days.filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  return {
    n: xs.length,
    median: xs.length > 0 ? xs[Math.floor((xs.length - 1) / 2)] : null,
    same: xs.filter((d) => d === 0).length,
    within6m: xs.filter((d) => d > 0 && d <= 183).length,
    within1y: xs.filter((d) => d > 183 && d <= 365).length,
    longer: xs.filter((d) => d > 365).length,
  };
}

/** 「截止 → 公布」的历史：结果公示里两头都有日子的那些（公布日早于截止日的不算 —— 多半是填错了）。 */
export function deadlineToPromulgate(items: Pick<PolicyItem, "deadline" | "promulgate_date">[]): number[] {
  return items
    .filter((i): i is { deadline: string; promulgate_date: string } => Boolean(i.deadline && i.promulgate_date))
    .map((i) => daysBetween(i.deadline, i.promulgate_date))
    .filter((d) => d >= 0);
}

/** 出政策题至少要这么多条「截止 → 公布」的历史（少了中位数和统计基准都不稳）。 */
export const POLICY_MIN_HISTORY = 30;

/** 政策题的门槛日：截止日加历史中位数，取那个月的月底（取整到月，题目好读；统计基准按实际天数算）。 */
export function policyResolveOn(deadline: string, medianDays: number): string {
  const d = new Date(Date.parse(`${deadline}T00:00:00Z`) + medianDays * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/**
 * 统计基准：历史上「截止 → 公布」在 limit 天以内的比例；已经过了截止 elapsed 天还没公布的，只看那些也拖过了 elapsed 天的（条件概率）。
 * 从没公布的不在历史里（结果公示里没写公布日的不算），所以偏乐观 —— 页面上说明。
 */
export function baseProbability(history: number[], limit: number, elapsed = 0): number | null {
  const pool = history.filter((d) => d > elapsed);
  if (pool.length < POLICY_MIN_HISTORY / 2) return null;
  const p = pool.filter((d) => d <= limit).length / pool.length;
  return Math.min(0.97, Math.max(0.03, Math.round(p * 100) / 100));
}

/** 标题去掉「（案）の意見募集について」这类尾巴，截短（题目里引用）。 */
export function shortPolicyTitle(title: string, max = 60): string {
  const t = title
    .replace(/[「」]/g, "")
    .replace(/(?:（案）|\(案\))?(?:等)?(?:に(?:関|対)する|の)?(?:御意見|ご意見|意見|意見・情報)の?(?:募集|公募)(?:の実施)?(?:について|の結果について)?$/, "")
    .replace(/(?:（案）|\(案\))$/, "")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
