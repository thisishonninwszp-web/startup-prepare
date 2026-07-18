# 「假方案」(decoy) 设计文档

日期:2026-07-18
状态:已获用户批准

## 背景与目的

用户在解决问题时有时完全没有思路。为防止"没思路 → 等 AI 给答案 → 丧失自主思考"的退化路径,新增一个思维陪练工具:AI 生成一份**看似正确、实则埋有隐藏错漏**的解决方案("假方案"),用户通过找出错漏来激发自主思考。

这与宪法原则 2(AI 必须对抗性)一脉相承:AI 不给答案,而是给一个需要被拆穿的诱饵。

## 定位

- **模块层级**:工具层(宪法命运表),无一级导航。
- **入口**:`/tools` 聚合页新增卡片;`/decoy` 路由;可从 idea/workbench 上下文带 `idea_id` 唤起(非必须,不关联 idea 也能用)。
- **不新增**:一级导航项、独立输入口、独立闭环系统。

## 单次练习流程(session 三阶段,线性)

1. **出题(drafted)**:用户输入卡住的问题(一段文字,30 秒内可完成,不强制关联 idea)。AI 一次性生成:
   - 分 3-5 段的方案正文(如:问题重述 / 解法路径 / 资源与执行 / 如何验证);
   - 隐藏的埋雷清单(不展示给用户)。
2. **质疑(challenged)**:界面只显示方案正文,旁边是质疑输入区(自由文本,可多条)。不告知埋雷数量与位置。提交前看不到任何答案。
3. **揭底(revealed)**:AI 将用户质疑与埋雷清单逐条对照,输出三类:
   - **抓到的**:用户识破的雷;
   - **漏掉的**:未发现的雷,附"为什么它看起来对、实际为什么错";
   - **额外发现**:用户提出的、AI 没埋但成立的真问题。明确指出这是独立思考的证据,措辞克制,不迎合(宪法原则 2)。

## 埋雷机制与错漏分类学

AI 生成结构化 JSON。每处雷:`{ section, quote(埋雷句原文), type, why_wrong }`。每次埋 2-4 处。类型从固定分类学中选,分类学定义为 `lib/ai/decoy.ts` 中的常量:

| type | 名称 | 说明 |
|---|---|---|
| `false_need` | 伪需求假设 | 把"我觉得有用"当"用户有痛" |
| `survivorship` | 幸存者偏差 | 拿成功案例当可复制路径 |
| `channel_fantasy` | 渠道幻觉 | "做好了自然有人来" |
| `armchair_number` | 拍脑袋数字 | 精确但无来源的数据 |
| `causal_inversion` | 因果倒置 | 相关当因果 |
| `hidden_cost` | 隐藏成本 | 时间/合规/维护被略过 |
| `unfalsifiable` | 不可证伪 | 方案怎样都能自圆其说 |

揭底时按类型展示。数据结构为将来在 learnings/patterns 统计"常漏哪类雷"留好基础(本期不做统计视图)。

## 数据模型

新表 `decoy_sessions`(迁移 `031_decoy_sessions.sql`,append-only,同步追加到 `supabase/schema.sql` 末尾):

```sql
create table if not exists public.decoy_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  idea_id     uuid references public.ideas (id) on delete set null,
  problem     text not null,
  plan        jsonb not null,          -- { sections: [...], planted_flaws: [...] }
  challenges  text,                    -- 用户质疑原文
  reveal      jsonb,                   -- { caught: [...], missed: [...], bonus: [...] }
  learned     text,                    -- 用户亲笔的一句总结(可空)
  status      text not null default 'drafted'
              check (status in ('drafted', 'challenged', 'revealed')),
  created_at  timestamptz not null default now(),
  revealed_at timestamptz
);
```

RLS 与现有表一致(单用户阶段 service role 跑通)。

## 代码落点

- `lib/ai/decoy.ts`:两个 AI 函数(生成假方案、对照揭底)+ JSON 解析器 + 错漏分类学常量;经 `lib/ai/index.ts` 桶导出;传输走 `lib/ai-gateway.ts`。
- `app/(app)/decoy/`:page.tsx + actions.ts + queries.ts(+ 客户端交互组件)。`PageContainer width="narrow"`。按钮用共享 `Button`/`ConfirmButton`(提交质疑是不可逆动作,用 ConfirmButton)。
- `app/(app)/tools/page.tsx`:TOOLS 数组加一项(title: 假方案,description 说明陪练用途)。
- 历史 session 列表放 `/decoy` 页底部,可点开回看已揭底的练习。

## 沉淀到"学到了"

- 揭底页提供可选按钮"把这次的盲点存为学到了":保存**用户亲笔**的一句总结(非 AI 代写)到 `decoy_sessions.learned`。
- `app/(app)/learnings/page.tsx` 的 learned tab 在现有 Kill 决策来源之外,增读 `decoy_sessions` 中 `learned` 非空的记录,按时间混排,标注来源"假方案练习"。
- `/learnings/handbook` 手册导出同步包含此来源。

## 合宪检查

- **原则 1(无评分)**:揭底只有抓到/漏掉/额外三类列表,不打分、不给百分比、不给星级。
- **原则 2(对抗性)**:生成阶段 AI 在"骗"用户,揭底阶段在批判;禁止"很有潜力"类措辞。
- **命运表**:工具层,不新增一级导航(导航保持 4 组 12 项)。
- **原则 4 精神**:错漏类型是枚举标签,不是多级强弱分类。
- **UI 铁律**:语义 token、PageContainer narrow、共享 Button、无 dark:、无 palette 类。

## 不做的事(YAGNI)

- 不做"常漏哪类雷"统计视图(数据存对即可,将来再做)。
- 不做逐段强制质疑(选了自由文本一次提交)。
- 不做假方案的多轮对话;一个 session 一次生成、一次质疑、一次揭底。
