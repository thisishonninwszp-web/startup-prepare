/**
 * 做法一：把 IdeaOS 的记录导出成一个给 AI 读的文件夹（Markdown），Codex / Claude Code 打开这个文件夹就能读。
 *
 *   npm run context:export                 → 写到 ./ai-context（已在 .gitignore）
 *   npm run context:export -- D:/somewhere → 写到指定文件夹
 *
 * 账号：IDEAOS_USER_EMAIL 指定；没指定就挑记录最多的那个。只读数据库，不写。
 * 每次导出前清空目标文件夹 —— 只在它是空的、或者是上一次导出的文件夹（README 开头对得上）时才清。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadContext, resolveContextUser } from "@/lib/domains/ai-context/load";
import { READER_RULES, renderContextFiles } from "@/lib/domains/ai-context/render";

async function main() {
  const out = resolve(process.argv[2] ?? "ai-context");
  if (existsSync(out) && readdirSync(out).length > 0) {
    const readme = join(out, "README.md");
    const ours = existsSync(readme) && readFileSync(readme, "utf8").startsWith(READER_RULES.split("\n")[0]);
    if (!ours) throw new Error(`${out} 里已经有别的东西，不敢清空。换一个空文件夹。`);
    rmSync(out, { recursive: true, force: true });
  }

  const user = await resolveContextUser();
  const data = await loadContext(user.id);
  const files = renderContextFiles(data);
  for (const f of files) {
    const p = join(out, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, "utf8");
  }
  console.log(`导出了 ${user.email} 的记录：${files.length} 个文件 → ${out}`);
  console.log(
    `想法 ${data.ideas.length}、观察 ${data.observations.length}、材料 ${data.materials.length}、判断 ${data.judgments.length}、在追的问题 ${data.questions.length}`
  );
}

main().catch((e) => {
  console.error("导出失败：", e instanceof Error ? e.message : e);
  process.exit(1);
});
