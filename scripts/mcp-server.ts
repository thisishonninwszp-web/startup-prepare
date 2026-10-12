/**
 * 做法二：IdeaOS 的只读 MCP 服务。Codex、Claude Code、Claude 桌面版接上以后，AI 需要时自己来查，永远是最新的。
 *
 * 在本机跑（stdio），用 .env.local 里的 service role key 读数据库；不开端口，别人连不上。
 * 只读：没有任何写入的工具 —— 材料箱是唯一的输入口。
 * 接法见 docs/ai-context.md。
 *
 * 注意：stdio 模式下标准输出只能走协议，日志一律写 stderr。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadContext, resolveContextUser } from "@/lib/domains/ai-context/load";
import {
  READER_RULES,
  renderIdea,
  renderJudgments,
  renderLearnings,
  renderMaterial,
  renderObservations,
  renderQuestion,
  searchContext,
  type ContextData,
} from "@/lib/domains/ai-context/render";

/** 一分钟内的连续提问共用一份数据，不每次都查库。 */
const CACHE_MS = 60_000;
let cache: { at: number; data: ContextData } | null = null;
let userId: string | null = null;

async function data(): Promise<ContextData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (!userId) userId = (await resolveContextUser()).id;
  cache = { at: Date.now(), data: await loadContext(userId) };
  return cache.data;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const day = (iso: string) => iso.slice(0, 10);

/** 用编号或标题里的一段找到某一条。 */
function pick<T extends { id: string }>(items: T[], key: string, title: (x: T) => string | null): T | undefined {
  const k = key.trim().toLowerCase();
  return items.find((x) => x.id === key.trim()) ?? items.find((x) => (title(x) ?? "").toLowerCase().includes(k));
}

const server = new McpServer({ name: "ideaos", version: "1.0.0" });

server.registerTool(
  "ideaos_overview",
  {
    title: "IdeaOS 总览（先看这个）",
    description:
      "一个人为了真正创业记下的东西：想法、去问真人的验证记录、观察、材料、读新闻写的判断。返回读这些记录的规矩和全部想法的清单。只读。回答前先调用这个。",
  },
  async () => {
    const d = await data();
    const ideas = d.ideas.map(
      (i) =>
        `- ${i.title ?? "（无题）"} · ${i.status} · 验证 ${i.validations.length} 次 · 最近动它 ${day(i.last_activity_at)} · 编号 ${i.id}`
    );
    return text(
      [
        READER_RULES,
        "",
        "# 现在有什么",
        "",
        `想法 ${d.ideas.length} 个、观察 ${d.observations.length} 条、材料 ${d.materials.length} 份、判断 ${d.judgments.length} 条、在追的问题 ${d.questions.length} 个。`,
        "",
        "## 想法",
        "",
        ...(ideas.length ? ideas : ["还没有。"]),
      ].join("\n")
    );
  }
);

server.registerTool(
  "ideaos_search",
  {
    title: "在全部记录里搜",
    description: "按关键词在想法、观察、材料、判断、在追的问题里找（不分大小写），返回每条的出处和一段上下文。",
    inputSchema: { query: z.string().min(1).describe("关键词，比如“即时零售”“社长”") },
  },
  async ({ query }) => {
    const hits = searchContext(await data(), query, 30);
    return text(hits.length ? hits.join("\n\n") : `没找到包含「${query}」的记录。`);
  }
);

server.registerTool(
  "ideaos_get_idea",
  {
    title: "看一个想法的全部记录",
    description: "假设六格、每一次验证记录、退出条件、押过的预测、做过的决定。可以用编号，也可以用标题里的一段。",
    inputSchema: { idea: z.string().min(1).describe("想法的编号，或标题里的一段") },
  },
  async ({ idea }) => {
    const hit = pick((await data()).ideas, idea, (x) => x.title);
    return text(hit ? renderIdea(hit) : `找不到「${idea}」。先调用 ideaos_overview 看有哪些想法。`);
  }
);

server.registerTool(
  "ideaos_observations",
  {
    title: "最近的观察",
    description: "平时随手记下的观察，新的在上面。",
    inputSchema: { days: z.number().int().min(1).max(3650).optional().describe("最近几天，默认 30") },
  },
  async ({ days }) => {
    const since = new Date(Date.now() - (days ?? 30) * 86_400_000).toISOString();
    return text(renderObservations((await data()).observations.filter((o) => o.created_at >= since)));
  }
);

server.registerTool(
  "ideaos_materials",
  {
    title: "材料",
    description: "材料箱里的材料（脱敏版）。不给 material 就列清单；给编号或标题里的一段就返回那一份的正文。",
    inputSchema: { material: z.string().optional().describe("材料的编号或标题里的一段；不填就列清单") },
  },
  async ({ material }) => {
    const ms = (await data()).materials;
    if (!material) {
      return text(
        ms.length ? ms.map((m) => `- ${day(m.created_at)} ${m.title ?? "（无题）"} · ${m.source_type} · 编号 ${m.id}`).join("\n") : "材料箱是空的。"
      );
    }
    const hit = pick(ms, material, (x) => x.title);
    return text(hit ? renderMaterial(hit) : `找不到「${material}」。`);
  }
);

server.registerTool(
  "ideaos_judgments",
  {
    title: "读新闻写下的判断",
    description: "用户的推测和到期后的对账结果（说中 / 没说中，没说中错在哪一步）。",
  },
  async () => text(renderJudgments((await data()).judgments))
);

server.registerTool(
  "ideaos_questions",
  {
    title: "用户在追的问题",
    description: "用户自己提的常驻问题，以及每一次写下的看法（只增不改）。",
  },
  async () => {
    const qs = (await data()).questions;
    return text(qs.length ? qs.map(renderQuestion).join("\n---\n\n") : "还没有在追的问题。");
  }
);

server.registerTool(
  "ideaos_learnings",
  {
    title: "学到了什么",
    description: "做 Go / Kill 等决定时写下的「学到了什么」。",
  },
  async () => text(renderLearnings((await data()).ideas))
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("IdeaOS MCP 已启动（只读）");
}

main().catch((e) => {
  console.error("IdeaOS MCP 启动失败：", e);
  process.exit(1);
});
