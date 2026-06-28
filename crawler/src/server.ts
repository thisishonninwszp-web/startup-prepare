import http from "node:http";
import cron from "node-cron";
import {
  runDueCustomerTopics,
  runJobs,
  watchlistJobs,
} from "./pipeline.js";
import { allHeavyJobs } from "./config.js";
import { SOURCES } from "./sources/index.js";

/**
 * 云端 worker：一个常驻服务同时承担两件事——
 *  ① 内置定时器（CRON_SCHEDULE，默认每天 8:00）自动跑全量监控和到期顾客研究主题。
 *  ② HTTP 接口 POST /crawl 供主应用网页按钮按需触发外部任务或指定顾客主题。
 *
 * 部署在有浏览器环境的平台（Railway 等），所以 Playwright 源在这里能跑——
 * 顾客主题结果写入该用户课题的候选材料；其他外部监控仍写 external_signals。
 */

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.CRAWLER_SECRET ?? "";
const SCHEDULE = process.env.CRON_SCHEDULE ?? "0 8 * * *";

type Job = { source: string; query: string };

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy(); // 防滥用：>1MB 直接断
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, code: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  // 健康检查：Railway 用它判断服务存活。
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/crawl") {
    // 鉴权：缺密钥或不匹配一律拒。SECRET 未配置时直接关掉接口（只留定时）。
    if (!SECRET) return send(res, 503, { error: "worker 未配置 CRAWLER_SECRET" });
    const auth = req.headers["authorization"] ?? "";
    if (auth !== `Bearer ${SECRET}`) return send(res, 401, { error: "unauthorized" });

    let payload: {
      jobs?: Job[];
      source?: string;
      query?: string;
      customerTopicId?: string;
    };
    try {
      payload = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return send(res, 400, { error: "请求体不是合法 JSON" });
    }

    if (payload.customerTopicId) {
      send(res, 202, { acceptedCustomerTopic: payload.customerTopicId });
      runDueCustomerTopics(payload.customerTopicId)
        .then((result) =>
          console.log(
            `[顾客主题] 完成：${result.topics} 主题，抓 ${result.fetched}，新增 ${result.inserted}`
          )
        )
        .catch((error) =>
          console.warn(
            "[顾客主题] 失败：",
            error instanceof Error ? error.message : error
          )
        );
      return;
    }

    // 两种形态：{ jobs:[{source,query}] }（主应用按语言分好的多源） 或 { source, query }。
    let jobs: Job[] = [];
    if (Array.isArray(payload.jobs)) {
      jobs = payload.jobs.filter(
        (j) => j && typeof j.source === "string" && typeof j.query === "string"
      );
    } else if (payload.source && payload.query) {
      jobs = [{ source: payload.source, query: payload.query }];
    }
    if (jobs.length === 0) return send(res, 400, { error: "缺少 jobs/source/query" });

    // 立刻 202 返回——Playwright 源慢（几十秒），不让调用方（Vercel server action）干等超时。
    // 真正抓取在后台异步跑，结果落库后会出现在收件箱，刷新即见。
    send(res, 202, { accepted: jobs.length });
    runJobs(jobs)
      .then((r) => console.log(`[按需] 完成：抓 ${r.fetched}，新增 ${r.inserted}`))
      .catch((e) => console.warn("[按需] 失败：", e instanceof Error ? e.message : e));
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`crawler worker 已启动，端口 ${PORT}`);
  console.log(`可用源：${Object.keys(SOURCES).join(", ")}`);
  console.log(`定时计划：${SCHEDULE}（含 Playwright 重型源）`);
  if (!SECRET) console.warn("⚠ 未配置 CRAWLER_SECRET：HTTP 按需触发已禁用，仅定时运行。");
});

// 内置定时器：到点跑「全量监控 + Playwright 重型源 × watchlist」。
cron.schedule(SCHEDULE, async () => {
  const jobs = [...watchlistJobs(), ...allHeavyJobs()];
  console.log(`[定时] 触发，${jobs.length} 个任务…`);
  try {
    const [r, customer] = await Promise.all([
      runJobs(jobs),
      runDueCustomerTopics(),
    ]);
    console.log(
      `[定时] 完成：外部信号抓 ${r.fetched}/新增 ${r.inserted}；顾客主题 ${customer.topics}/新增 ${customer.inserted}`
    );
  } catch (e) {
    console.warn("[定时] 失败：", e instanceof Error ? e.message : e);
  }
});
