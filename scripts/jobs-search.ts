/**
 * 手动大搜一轮岗位：npm run jobs:search
 * 跟填表助手每天自动跑的那一轮一样（每类两个说法，招聘系统和求人网站都搜，最多留 30 条），没有 60 秒的限制。
 * 搜完列出"今天搜到的"，去 /jobs 点「要这个」或「不要」。
 */
import { listPostings } from "@/lib/domains/jobs/postings";
import { listJobProfileUsers } from "@/lib/domains/jobs/profile";
import { runBigJobSearch } from "@/lib/domains/jobs/search";
import {
  atsOf,
  boardOf,
  BOARD_SITES,
  categoryLabel,
  EXPERIENCE_LABELS,
  experienceVerdict,
  HIRE_TYPES,
  REMOTE_LEVELS,
  tokyoDate,
} from "@/lib/domains/jobs/shared";
import { markBigSearched } from "./big-search-state";
import { patchDns } from "./dns-patch";

async function main(): Promise<void> {
  patchDns();
  for (const userId of await listJobProfileUsers()) {
    const started = Date.now();
    const today = tokyoDate();
    const r = await runBigJobSearch(userId, today);
    markBigSearched(today);
    console.log(`搜完了（${Math.round((Date.now() - started) / 1000)} 秒）：读了 ${r.read} 个岗位，新留下 ${r.kept} 条。${r.skipped.join("；")}`);
    const { candidates } = await listPostings(userId);
    for (const c of candidates) {
      const f = c.facts;
      const board = boardOf(c.url);
      const where = atsOf(c.url) ? "官网可直接应募" : board ? `要在 ${BOARD_SITES[board].label} 上投` : "";
      console.log(`- [${categoryLabel(c.category)}] ${c.company_name}｜${c.title}`);
      console.log(`    ${HIRE_TYPES[f.hire_type ?? "unclear"]} · ${EXPERIENCE_LABELS[experienceVerdict(f.experience?.min_years)]} · ${REMOTE_LEVELS[f.remote]} · 年收 ${f.salary_min ?? "?"}–${f.salary_max ?? "?"} 万 · ${where}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
