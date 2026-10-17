/**
 * 抓官报的会社決算公告：
 *   npm run kanpo:fetch                把最近 90 天里还没抓过的日子补齐（第一次要跑一阵子）
 *   npm run kanpo:fetch -- 2026-10-16  只抓那一天
 *   npm run kanpo:fetch -- --again     这 90 天全部重抓（改了抽取规则以后用，十几分钟）
 * 填表助手每天第一次开起来时也会跑一次。
 */
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { patchDns } from "./dns-patch";
import { runKanpoFetch } from "./kanpo-run";
import { markKanpoFetched } from "./kanpo-state";

async function main(): Promise<void> {
  patchDns();
  const only = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const again = process.argv.includes("--again");
  const started = Date.now();
  const r = await runKanpoFetch({ only, again });
  if (!only) markKanpoFetched(tokyoDate());
  console.log(
    r.days === 0
      ? "都抓过了，没有新的日子。"
      : `抓完了（${Math.round((Date.now() - started) / 60000)} 分钟）：${r.days} 天，决算公告 ${r.notices} 条，没抽全 ${r.incomplete} 条。去 /signals/kanpo 看。`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
