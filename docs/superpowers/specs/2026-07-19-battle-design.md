# 「心魔」(battle) 设计文档

日期:2026-07-19
状态:已获用户批准

## 背景与目的

用户想要"和自己 battle 的辩论"功能,通过辩论找逻辑漏洞。但自己同时打正反双方不现实(无法快速切换视角)。最终定位:**AI 扮演"你心里想信的那个声音"(心魔),替你的动机性推理护盘;你负责进攻,把它拆穿。**

训练点:在对手抵赖、换借口的动态对抗中把逻辑漏洞钉死——区别于顾问团(外部专家视角质疑你)和假方案(静态文本里找预埋的雷)。

## 定位

- **模块层级**:工具层(宪法命运表),无一级导航。
- **入口**:`/tools` 聚合页新增卡片;路由 `/battle`;可带 `?ideaId=` 从想法上下文唤起(非必须)。
- **不新增**:一级导航项、独立输入口、独立闭环、新的错漏分类学(复用 decoy 的 `DECOY_FLAW_TYPES` 18 类)。

## 单场对战流程

1. **立主张(active)**:用户输入一个自己心动、想信的主张(30 秒内,自由文本,可选关联 idea)。
   AI 心魔立即用**用户的口吻**(第一人称"我")做开盘护盘陈词,论据中故意混入 18 类分类学中的谬误
   (风口叙事、礼貌好评、免费幻觉等——真实创业者自我说服时用的那些)。
2. **多回合对战(active)**:用户攻,心魔辩。行为规则:
   - 被用户**实质拆穿**的论据,心魔必须放弃,换下一个借口继续护盘(真实自我说服的行为模式:
     借口崩了就跳下一个,而不是认输);
   - 只沾边、没打中要害的进攻,心魔正面反驳,不让步;
   - 借口用尽时心魔**词穷认输**,自动结束;
   - 用户随时可点**收兵复盘**结束;
   - 软上限 8 个用户回合:达到后心魔强制词穷。
3. **复盘(concluded,结束即出,强制)**:AI 对照全场记录输出三栏(同假方案结构):
   - **拆穿的**:用户实质点破的谬误;
   - **漏掉的**:心魔用了、用户没点破的谬误,附"它当时怎么骗过你的";
   - **额外好问题**:用户进攻里超出谬误账本、但确实成立的真质疑。措辞克制,不夸奖。
4. **亲笔立场(主产物)**:复盘后用户亲笔写"我现在还信这个主张吗?改成什么样?"存入
   `final_position`。历史列表以它为主展示(沿用假方案的落点原则)。
5. **学到了(可选)**:一句亲笔总结存入 `learned`,混排进 /learnings 与手册,来源标"心魔"。

## 谬误记账机制(核心设计决策)

**边打边记**:心魔每条回复由 AI 同时输出两部分——展示给用户的 `content`,和本回合护盘用到的
`fallacies: [{ type, quote }]`(type 来自 `DECOY_FLAW_TYPES`,quote 是 content 的逐字子串,
解析器强校验)。fallacies 存进该条消息,但 **active 状态下服务端剥离,绝不下发客户端**
(同假方案的防泄漏铁律)。复盘时把逐回合账本与用户全部进攻对照,产出三栏。

否决的备选:事后分析(复盘易放马后炮)、开局排剧本(多回合照剧本演容易崩)。

心魔每回合还输出 `out_of_excuses: boolean`,为 true 即词穷认输(prompt 要求:确实没有新的
站得住的借口时才词穷,不许硬撑到上限,也不许轻易缴械)。

## 数据模型

新表 `battle_sessions`(迁移 `032_battle_sessions.sql`,append-only,同步追加 `supabase/schema.sql`):

```sql
create table if not exists battle_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  idea_id        uuid references ideas (id) on delete set null,
  claim          text not null,           -- 用户想信的主张
  messages       jsonb not null default '[]'::jsonb,
  -- [{ role: 'user' | 'demon', content, fallacies?: [{type, quote}], out_of_excuses? }]
  recap          jsonb,                   -- { caught: [...], missed: [...], bonus: [...] }
  final_position text,                    -- 亲笔:现在还信吗/改成什么样(主产物)
  learned        text,                    -- 亲笔一句总结(可空)
  status         text not null default 'active'
                 check (status in ('active', 'concluded')),
  created_at     timestamptz not null default now(),
  concluded_at   timestamptz
);
```

索引/RLS 同 decoy_sessions 模式(user_id + created_at desc 索引,owner policy)。

## 代码落点

- `app/(app)/battle/types.ts`:消息/复盘类型 + 解析器(parseDemonTurn、parseBattleRecap);
  谬误类型直接 import decoy 的 `DECOY_FLAW_TYPES`/`decoyFlawLabel`。
- `lib/ai/battle.ts`:三个 AI 函数——`demonOpening`(开盘陈词)、`demonTurn`(接招:输入历史+
  最新进攻,输出 content/fallacies/out_of_excuses)、`battleRecap`(复盘三栏);经 lib/ai/index.ts
  桶导出,JSON 走 `generateRealityJson`。
- `app/(app)/battle/`:page.tsx(服务端装配,active 时剥离 fallacies)+ queries.ts + actions.ts
  (createBattle、attack、concede 收兵、saveFinalPosition、saveBattleLearned)+ battle-arena.tsx
  (客户端对战 UI)。`PageContainer width="narrow"`,共享 Button/ConfirmButton(收兵是不可逆动作,
  用 ConfirmButton)。
- `app/(app)/tools/page.tsx`:TOOLS 数组加「心魔」卡片。
- `/learnings` 与手册:learned 来源在 kill/decoy 之外加 battle,标注"心魔"。

## 合宪检查

- **原则 1(无评分)**:复盘只有三栏清单,无分数/百分比/胜负值。
- **原则 2(对抗性)**:心魔的"迎合"是角色扮演,对象是用户的偏误,存在目的是被拆穿;
  复盘与词穷台词禁止"你真棒"类语言,额外好问题栏措辞克制。
- **命运表**:工具层,无一级导航;多回合对话有顾问团先例。
- **落点原则(承自 decoy v2)**:主产物是用户亲笔的 final_position,历史列表以它为主展示。

## 不做的事(YAGNI)

- 不做胜负判定/战绩统计;复盘只有清单。
- 不做心魔人格设定/自定义;口吻固定为"用户自己的声音"。
- 不做多心魔混战;一场一个心魔。
- 不做 final_position 的版本历史;修订直接覆盖。
- 不给心魔回复做流式输出;沿用整条返回。
