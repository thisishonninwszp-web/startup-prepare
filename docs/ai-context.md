# 让 Codex / Claude Code 读 IdeaOS 的记录

两种做法，读的是同一批东西：想法（含验证记录、退出条件、预测、决定）、观察、材料（脱敏版）、读新闻写的判断、在追的问题、学到了什么。
**都只读**：外面的 AI 不能往 IdeaOS 里写任何东西，要记新东西还是走材料箱。

每份导出、每次查询都带着一段规矩（`lib/domains/ai-context/render.ts` 的 `READER_RULES`）：
找想法会死的理由、不夸、不打分、分清亲眼看到的和自己推测的、说话要给出处、Go/Kill 由用户定。
外面的 AI 听不听没法保证 —— 看到它在夸你，就把规矩那一段再贴给它一次。

账号：默认挑记录最多的那个；要指定就在 `.env.local` 里加 `IDEAOS_USER_EMAIL=你的邮箱`。

## 做法一：导出成文件夹

```bash
npm run context:export
```

写到项目里的 `ai-context/`（已在 .gitignore，不会提交）。想放别处：`npm run context:export -- D:/ideaos-context`。
然后在 Codex 或 Claude Code 里打开这个文件夹，先让它读 `README.md`。

这是快照，之后记的东西不在里面，要用前重新导一次。

## 做法二：MCP（实时）

AI 需要时自己来查，永远是最新的。服务在本机跑、不开端口，别人连不上。

**Claude Code**（在任意目录执行一次）：

```bash
claude mcp add ideaos --scope user -- node D:/projects/startup-prepare/node_modules/tsx/dist/cli.mjs --env-file=D:/projects/startup-prepare/.env.local --tsconfig D:/projects/startup-prepare/tsconfig.json D:/projects/startup-prepare/scripts/mcp-server.ts
```

**Codex**：在 `C:\Users\pc\.codex\config.toml` 末尾加：

```toml
[mcp_servers.ideaos]
command = "node"
args = [
  "D:/projects/startup-prepare/node_modules/tsx/dist/cli.mjs",
  "--env-file=D:/projects/startup-prepare/.env.local",
  "--tsconfig", "D:/projects/startup-prepare/tsconfig.json",
  "D:/projects/startup-prepare/scripts/mcp-server.ts",
]
```

接上以后可以直接问，比如「用 ideaos 看看我这三个月的观察里，哪些事反复出现但一直没变成想法」。

提供的工具：

| 工具 | 干什么 |
|---|---|
| ideaos_overview | 规矩 + 全部想法的清单（先调这个） |
| ideaos_search | 按关键词在所有记录里找 |
| ideaos_get_idea | 一个想法的全部记录（编号或标题里的一段） |
| ideaos_observations | 最近 N 天的观察 |
| ideaos_materials | 材料清单 / 某一份的正文 |
| ideaos_judgments | 读新闻写的判断和对账结果 |
| ideaos_questions | 在追的问题和看法 |
| ideaos_learnings | 做决定时写下的「学到了什么」 |

项目搬了位置的话，把上面路径里的 `D:/projects/startup-prepare` 换掉。
