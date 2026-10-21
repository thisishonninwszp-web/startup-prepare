/**
 * 有没有补助金可以拿：jGrants（数字厅的补助金电子申请系统）的公开接口，不用 Key。
 * 只列现在还在招募的；能不能申请要看每一条的条件（行业、地区、成立几年、员工几人），点进去看。
 * 浏览器端也要用的部分，不碰网络。
 */

export type Grant = {
  id: string;
  title: string;
  url: string;
  /** 截止日 YYYY-MM-DD；没写为空。 */
  deadline: string;
  /** 最多给多少日元；接口给 0 = 没写。 */
  max: number | null;
  area: string;
  /** 对象员工人数（接口原样）。 */
  employees: string;
};

/** 「不限地区」= 不按地区筛（接口里「全国」只是标了全国的那几条，大多数补助金是按县标的）。 */
export const ANY_AREA = "不限地区";

export const GRANT_AREAS = [
  ANY_AREA,
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export function isGrantArea(v: string): v is (typeof GRANT_AREAS)[number] {
  return (GRANT_AREAS as readonly string[]).includes(v);
}

/** jGrants 的补助金列表（/exp/v1/public/subsidies）→ 几条。 */
export function parseGrants(json: unknown): Grant[] {
  const list = (json as { result?: Record<string, unknown>[] } | null)?.result;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r) => {
    const id = typeof r.id === "string" ? r.id : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!id || !title) return [];
    const max = typeof r.subsidy_max_limit === "number" && r.subsidy_max_limit > 0 ? r.subsidy_max_limit : null;
    return [
      {
        id,
        title,
        url: `https://www.jgrants-portal.go.jp/subsidy/${id}`,
        deadline: typeof r.acceptance_end_datetime === "string" ? r.acceptance_end_datetime.slice(0, 10) : "",
        max,
        area: typeof r.target_area_search === "string" ? r.target_area_search : "",
        employees: typeof r.target_number_of_employees === "string" ? r.target_number_of_employees : "",
      },
    ];
  });
}

/** 几次查询合在一起：去重，截止早的在前（没写截止的放最后）。 */
export function mergeGrants(lists: Grant[][]): Grant[] {
  const byId = new Map<string, Grant>();
  for (const list of lists) for (const g of list) if (!byId.has(g.id)) byId.set(g.id, g);
  return Array.from(byId.values()).sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
}
