import { runJobs, watchlistJobs } from "./pipeline.js";
import { SOURCES } from "./sources/index.js";

/**
 * 入口。两种用法：
 *   tsx src/cli.ts --watchlist                       跑 config.ts 里的全量监控
 *   tsx src/cli.ts --source hackernews --query "..."  单源单关键词
 */
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let jobs: { source: string; query: string }[];

  if (args.watchlist) {
    jobs = watchlistJobs();
  } else {
    const source = typeof args.source === "string" ? args.source : "";
    const query = typeof args.query === "string" ? args.query : "";
    if (!source || !query) {
      console.error(
        [
          "用法：",
          "  npm run watchlist",
          "  npm run crawl -- --source <name> --query <text>",
          `可用源：${Object.keys(SOURCES).join(", ")}`,
        ].join("\n")
      );
      process.exit(1);
    }
    jobs = [{ source, query }];
  }

  console.log(`开始抓取：${jobs.length} 个任务…`);
  const { fetched, inserted } = await runJobs(jobs);
  console.log(`完成。共抓取 ${fetched} 条，新增 ${inserted} 条待审信号。`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
