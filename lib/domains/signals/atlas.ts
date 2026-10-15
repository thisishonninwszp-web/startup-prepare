import { supabaseAdmin } from "@/lib/supabase";
import { proposeTransferCases, verifyTransferCase, type TransferDraft, type VerifiedTransfer } from "@/lib/ai";
import { webSearch } from "@/lib/web-search";
import { tokyoToday } from "./brief";
import { listGapBoard } from "./gaps";
import { mergeSources } from "./sources";
import { lagMonths, type TransferCase } from "./atlas-shared";

export * from "./atlas-shared";

/**
 * 时差图谱：一样东西在中国 / 美国先有，什么时候到了日本（或没到）、结果怎样、谁带进来的。
 * 每一件都要上网核实三样（那边的日子、日本的日子或明确写着没有、在日本的结果），缺一样不收。
 * 来源：一开始的十件样例；之后"再找几件"由 AI 提候选，差距清单里重查发现"日本有了"的一起拿去查。
 */

const MISSING_MIGRATION = "迁移 073 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/073_signal_transfer_cases.sql。";

/** 每件搜几篇资料（每个搜索词）。 */
const RESULTS_PER_QUERY = 3;
/** 一次最多查几件（每件要搜两三次，一次请求只有 60 秒）。 */
const BATCH = 6;
/** 差距清单里"日本有了"的，一次最多带几件进来查。 */
const FROM_RECHECKS = 3;

/** 一开始的十件（2026-10 上网核实过日子和结果的那十件），照样再走一遍核实，原文由代码核对。 */
export const SEED_CASES: TransferDraft[] = [
  {
    thing: "扫码支付",
    category: "payment",
    origin: "china",
    originEvent: "支付宝、微信大力推广线下二维码支付",
    originDate: "2014",
    japanEvent: "PayPay 上线",
    japanDate: "2018-10-05",
    outcome: "widespread",
    carrier: "local",
    queries: ["支付宝 微信 线下 二维码支付 2014 推广", "PayPay 2018年10月5日 サービス開始", "PayPay 登録ユーザー 7000万 突破"],
  },
  {
    thing: "共享充电宝",
    category: "hardware",
    origin: "china",
    originEvent: "来电、街电、小电等共享充电宝集中融资、铺开",
    originDate: "2017",
    japanEvent: "INFORICH 推出 ChargeSPOT",
    japanDate: "2018-04",
    outcome: "widespread",
    carrier: "local",
    queries: ["共享充电宝 2017 融资 街电 小电 来电", "ChargeSPOT 2018年4月 サービス開始 INFORICH", "ChargeSPOT 全国47都道府県 設置"],
  },
  {
    thing: "无桩共享单车",
    category: "mobility",
    origin: "china",
    originEvent: "摩拜单车在上海上线",
    originDate: "2016-04-22",
    japanEvent: "摩拜在札幌上线",
    japanDate: "2017-08",
    outcome: "exited",
    carrier: "china",
    queries: ["摩拜单车 2016年4月22日 上海 上线", "Mobike 札幌 2017年8月 サービス開始", "モバイク 2020年2月16日 シェアサイクル事業 停止 撤退"],
  },
  {
    thing: "外卖平台",
    category: "food",
    origin: "china",
    originEvent: "美团外卖上线",
    originDate: "2013-11",
    japanEvent: "Uber Eats 在东京上线",
    japanDate: "2016-09",
    outcome: "partial",
    carrier: "us",
    queries: ["美团外卖 2013年11月 上线", "Uber Eats Tokyo launch September 2016", "DiDi Food Japan shut down 2022"],
  },
  {
    thing: "网约车",
    category: "mobility",
    origin: "china",
    originEvent: "滴滴打车在北京上线",
    originDate: "2012-09",
    japanEvent: "日本版ライドシェア（只允许出租车公司在缺车时段用私家车）",
    japanDate: "2024-04",
    outcome: "blocked",
    carrier: "local",
    queries: ["滴滴打车 2012年9月 上线 北京", "日本版ライドシェア 2024年4月 開始 タクシー会社", "日本版ライドシェア タクシー会社以外 参入 見送り"],
  },
  {
    thing: "短视频",
    category: "content",
    origin: "china",
    originEvent: "字节跳动在中国上线抖音",
    originDate: "2016-09",
    japanEvent: "TikTok 在日本上线",
    japanDate: "2017",
    outcome: "widespread",
    carrier: "china",
    queries: ["抖音 2016年9月 上线 字节跳动", "TikTok 日本 2017年 サービス開始", "TikTok 日本 利用者数 国内"],
  },
  {
    thing: "超级 App 里的小程序",
    category: "work",
    origin: "china",
    originEvent: "微信小程序正式上线",
    originDate: "2017-01",
    japanEvent: "LINE MINI App 开放企业申请",
    japanDate: "2020-07",
    outcome: "partial",
    carrier: "local",
    queries: ["微信小程序 2017年1月 正式上线", "LINEミニアプリ 2020年7月 エントリー受付 開始", "LINEミニアプリ 導入 企業数"],
  },
  {
    thing: "直播带货",
    category: "commerce",
    origin: "china",
    originEvent: "淘宝直播上线",
    originDate: "2016-04",
    japanEvent: "メルカリチャンネル（2019 年关闭）",
    japanDate: "2017",
    outcome: "niche",
    carrier: "local",
    queries: ["淘宝直播 2016年4月 正式上线", "メルカリチャンネル 2017年 開始 ライブコマース", "メルカリチャンネル 2019年7月8日 終了"],
  },
  {
    thing: "无人收银店",
    category: "commerce",
    origin: "us",
    originEvent: "Amazon Go 向公众开放",
    originDate: "2018-01-22",
    japanEvent: "TOUCH TO GO 在高轮 Gateway 站开业",
    japanDate: "2020-03-23",
    outcome: "niche",
    carrier: "local",
    queries: ["Amazon Go opens to public January 22 2018", "TOUCH TO GO 高輪ゲートウェイ 2020年3月23日 開業", "TOUCH TO GO 無人決済システム 100か所 導入"],
  },
  {
    thing: "流媒体订阅视频",
    category: "content",
    origin: "us",
    originEvent: "Netflix 开始在线播放",
    originDate: "2007-01",
    japanEvent: "Netflix 进入日本",
    japanDate: "2015-09-02",
    outcome: "widespread",
    carrier: "us",
    queries: ["Netflix streaming launched January 2007 Watch Now", "Netflix Japan launch September 2 2015", "Netflix 日本 会員数"],
  },
];

function toCase(r: Record<string, unknown>): TransferCase {
  return {
    id: r.id as string,
    thing: r.thing as string,
    category: r.category as TransferCase["category"],
    origin: r.origin as TransferCase["origin"],
    origin_event: r.origin_event as string,
    origin_date: r.origin_date as string,
    japan_event: (r.japan_event as string | null) ?? null,
    japan_date: (r.japan_date as string | null) ?? null,
    outcome: r.outcome as TransferCase["outcome"],
    carrier: r.carrier as TransferCase["carrier"],
    lag_months: (r.lag_months as number | null) ?? null,
    sources: (r.sources as TransferCase["sources"]) ?? [],
    found_via: r.found_via as TransferCase["found_via"],
  };
}

/** 图谱里的全部（按类别、时间差排）；表还没建返回 "missing-schema"。 */
export async function listTransferCases(userId: string): Promise<TransferCase[] | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_transfer_cases")
    .select("id, thing, category, origin, origin_event, origin_date, japan_event, japan_date, outcome, carrier, lag_months, sources, found_via")
    .eq("user_id", userId)
    .order("category")
    .order("lag_months", { ascending: true, nullsFirst: false });
  if (error) {
    if (/signal_transfer_cases/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => toCase(r as Record<string, unknown>));
}

async function verifyDraft(draft: TransferDraft): Promise<VerifiedTransfer | null> {
  const found = await Promise.all(draft.queries.map((q) => webSearch(q, RESULTS_PER_QUERY).catch(() => [])));
  const sources = mergeSources(found, RESULTS_PER_QUERY * draft.queries.length);
  return verifyTransferCase(draft, sources).catch((e) => {
    console.error("atlas verify failed", draft.thing, e);
    return null;
  });
}

/**
 * 查一批、只存核实过的。mode=seed：从十件样例开始；mode=more：AI 提候选，
 * 差距清单里重查发现"日本有了"的一起拿去查。返回这次查了几件、收了几件。
 */
export async function researchTransferCases(userId: string, mode: "seed" | "more"): Promise<{ tried: number; kept: number }> {
  const existing = await listTransferCases(userId);
  if (existing === "missing-schema") throw new Error(MISSING_MIGRATION);
  const have = existing.map((c) => c.thing);

  let drafts: TransferDraft[];
  let fromRecheck = new Set<string>();
  if (mode === "seed") {
    drafts = SEED_CASES.filter((d) => !have.includes(d.thing)).slice(0, SEED_CASES.length);
  } else {
    // 差距清单里重查发现"日本有了"的（中国、美国 → 日本这两个方向）
    const board = await listGapBoard(userId, tokyoToday());
    const arrived = [...board.sides.japan.arrived, ...board.sides.us.arrived]
      .map((g) => g.headline)
      .slice(0, FROM_RECHECKS);
    fromRecheck = new Set(arrived);
    drafts = await proposeTransferCases({ count: BATCH - arrived.length, mustInclude: arrived, existing: have });
    drafts = drafts.slice(0, BATCH);
  }
  if (drafts.length === 0) return { tried: 0, kept: 0 };

  const verified = (await Promise.all(drafts.map(verifyDraft))).filter((v): v is VerifiedTransfer => v !== null);
  if (verified.length > 0) {
    const { error } = await supabaseAdmin.from("signal_transfer_cases").upsert(
      verified.map((v) => ({
        user_id: userId,
        thing: v.thing,
        category: v.category,
        origin: v.origin,
        origin_event: v.originEvent,
        origin_date: v.originDate,
        japan_event: v.japanEvent,
        japan_date: v.japanDate,
        outcome: v.outcome,
        carrier: v.carrier,
        lag_months: lagMonths(v.originDate, v.japanDate),
        sources: v.sources,
        found_via: mode === "seed" ? "seed" : fromRecheck.has(v.thing) ? "recheck" : "research",
      })),
      { onConflict: "user_id,thing", ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
  }
  return { tried: drafts.length, kept: verified.length };
}
