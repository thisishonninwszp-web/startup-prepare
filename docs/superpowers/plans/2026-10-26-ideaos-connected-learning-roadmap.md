# IdeaOS 后续改进计划：决策联动与主动数据采集

> **For agentic workers:** 执行前使用 executing-plans；涉及独立并行任务时先读取 subagent-driven-development 并明确文件边界。本文件是分阶段产品与工程路线图，不代表授权立即实施、接入付费服务、执行生产迁移或部署。每一期先形成独立实施计划，再开发与验收。

**Goal:** 让当前决策驱动信息收集，把新闻、搜索行为、企业活动、真实接触和个人经验连成可追溯的验证流程；暂时接触不到相关人群时，仍能排除前提、重建任务和测试交付能力，并明确尚未验证的需求。

**Architecture:** 扩展现有决策工作台、信息缺口、收束记录与来源快照。新增可版本化的观察任务和采集运行记录，跨模块关联以用户确认和可核对引用为基础；AI只提出解释、问题和关联建议，不替用户判定需求或作出Go/Kill决定。

**Tech Stack:** 继续使用 Next.js 14 App Router、TypeScript、Tailwind/shadcn、Supabase PostgreSQL、现有Gemini封装及Vercel。不引入图数据库，不替换既有技术栈。

**状态：** 2026-10-26路线图。P1/P1A/P2/P3/P4/P5/P6均已有本地实现，生产迁移和实机验收以各期交付说明为准；生产启用仍待各期验收。计划覆盖阅读增强、跨模块联动、外部数据与主动采集；不重复建设事件档案A–E。

**首批执行更新：** P1/P1A/P2已有本地实现，首版观察任务限定想法对象，搜索实时API和自动调度未接入。实际交付、验证和生产待办见[首批交付说明](2026-10-26-connected-learning-delivery.md)。以下未勾选项保留原规划定义，不能据此推断已上线；后续进度见下方P3更新。

**P3执行更新：** 企业身份、活动、招聘、竞品及想法双向复查的本地流程已完成，见[企业联动交付](2026-10-26-company-observations-delivery.md)。官方API适配已测试但无凭证实机联调，EDINET仅人工路径；P4已本地实现，P5已本地实现，P6仍未实施。

**P4执行更新（2026-10-27）：** 反馈、跨想法适用、确认后调整观察、接触提纲与归档复查已本地完成，见[反馈联动交付](2026-10-27-feedback-learning-delivery.md)。新增111–113迁移与默认关闭的FEEDBACK_LEARNING_ENABLED；未部署。

**P5执行更新（2026-10-27）：** 来源纠错、解释质量核对、阅读约定与固定留样已本地完成，见[推理与阅读交付](2026-10-27-reasoning-attention-delivery.md)。新增114/115迁移及默认关闭REASONING_ATTENTION_ENABLED；未远端迁移/部署，P6仍待实施。

**P6执行更新（2026-10-28）：** 固定e-Stat分母已实机核验，默认关闭的原型事件接入、预算调度与清理能力已本地完成，见[长期数据交付](2026-10-28-longitudinal-data-delivery.md)。新增116–118；没有接真实原型、启用生产timer、迁移远端或部署。前述各期“待实施”是历史记录，以本次状态为准。

**本次修订：** 增加“接触条件有限”的验证分支及代码设计，见第12节；首批顺序调整为P1 → P1A → P2。接触条件是可变资源约束，不是对用户能力或机会的评分。

**新增产品扩展（2026-10-28，设计阶段）：** “每日一门生意”采用一家店＋主打商品＋对照店，每日主案例不重复，围绕购买情境、成交、履约、失效条件及最小验证展开。见[产品设计](../specs/2026-10-28-daily-business-teardown-design.md)与[四期实施计划](2026-10-28-daily-business-teardown-plan.md)。该扩展尚未开发，不属于上述P1–P6本地完成范围；旧AI许可和e-Stat调度不自动延伸至商店数据。

---

## 1. 产品方向与取舍

主线：**一个正在做的决定 → 关键假设与缺口 → 如何观察 → 得到了什么 → 下一次真实行动 → Go/Kill与学到的经验。**

考虑过三条路径：

| 路径 | 好处 | 代价与取舍 |
|---|---|---|
| 继续增加新闻来源与阅读面板 | 很快能看到更多材料 | 信息量增加，但未必推进决定；仅作为来源补充 |
| 一次建通用数据平台 | 长期可扩展 | 先承受实体治理、适配与运维成本；当前不采用 |
| 决策驱动、分来源接入 | 每个采集任务有具体问题与出口，可逐期验证 | 初期覆盖较窄；作为推荐主线 |

不要求用户先建决策才能随手捕捉。捕捉仍然不强制标题和分类，之后可选择关联。已有新闻阅读、想法、求职与其他模块仍可独立使用。

## 2. 已有基础与复用边界

| 已有能力 | 位置 | 本轮后续扩展 |
|---|---|---|
| 决策对象与工作台 | `app/(app)/workbench/page.tsx`、`queries.ts`、`domain.ts` | 聚合当前缺口、来源变化和下一次行动；不再新增同义工作台 |
| 决策收束及来源 | `lib/domains/closures/{domain,queries,actions,reality-source}.ts` | 复用current_judgment、critical_unknowns、selected_next_step、completion_criterion、basis_refs |
| 想法信息缺口 | `lib/domains/ideas/info-gaps.ts`、`info-gaps-shared.ts` | 把“去哪里找”推进到可重复观察与运行历史 |
| 新闻与事件档案 | `lib/domains/signals/events/`、`app/(app)/signals/events/` | 复用冻结快照、逐字引用、版本和时间边界 |
| 招聘采集 | `lib/domains/jobs/{search,postings,page-text}.ts` | 同时服务岗位匹配与企业任务研究，保留原岗位用途 |
| 真实接触 | `app/(app)/outreach/`、现有validations | 从信息缺口形成提纲；用户执行后补回真实反馈，不自动发送消息 |
| 企业、材料、经验 | `app/(app)/companies/`、`materials/`、`learnings/` | 复用对象、原始材料和经验，明确适用范围 |

执行前重新读取相应文件及最新数据库结构。既有对象关联已在decision_objects、decision_object_links中存在，优先扩展，禁止先假定需要另造一套通用关系表。

### 2.1 当前发布前置条件

2026-10-26最近检查：事件档案A–E本地1438测试、生产构建、三套PostgreSQL集成及12项浏览器检查通过；配置远端缺新事件表/RPC，105–107尚需迁移及实机验收。后续开发不能把这些本地结果当作已上线。

详见 `2026-10-26-event-dossiers-preflight.md` 与 `2026-10-25-event-dossiers-delivery.md`。后续迁移编号在实施时按仓库实际最新序号分配，不预占108及以后编号。

## 3. 不可违背的边界

1. 不增加想法评分、星级、数字成功率；数量、价格、搜索量等原始观测数值可保留，不能变成想法总分。
2. 不新增想法状态，不增加或修改锁定机制；Go/Kill由用户决定，归档语言使用“学到了什么”。
3. 验证信号仍只有has_pain与will_pay，各为yes/no/unsure；不另建强弱证据等级。
4. 来源类别、采集状态和引用关系用于追溯，不冒充证据可信度等级。
5. 搜索、讨论、招聘、新闻只能提出待验证问题，不能自动把has_pain或will_pay置为yes。
6. AI生成关键词、提案、解释必须标明其生成性质；不能冒充真实搜索原话、用户反馈或已发生的事实。
7. 用户确认后才保存跨模块建议关系或采纳行动；不自动联系客户、不自动购买数据、不自动投放广告。
8. 既有事件研究的Gemini授权不自动扩大到邮件、访谈、客户资料和产品行为。新的数据用途需明确告知、选择与授权，私人输入默认不外发。
9. 首期不加新一级导航。优先在工作台、信息缺口、新闻/事件详情、企业与想法详情中嵌入。
10. 无真实验证记录时展示“痛点/付费仍未知”，不为占位而写入虚构validations。技术测试成功、公开抱怨、AI客户模拟均不能自动创建真实接触记录或改变想法状态。

## 4. 端到端使用示例

假设用户正在决定：是否花两周做面向日本小型旅馆的多语言接待原型。

1. 复用想法与决策收束，写下关键未知：经营者到底在哪种接待任务上遇到问题。
2. 从缺口建立观察任务，设定日本、日语、旅馆接待、待查词组、来源及观察周期。
3. 程序扩展“深夜入住”“外国客人电话”等种子，但明确标为待查查询；只把来源实际返回的内容记作观测。
4. 搜索指标、公开问题与招聘任务分别保存，不合并成需求评分；列出重复问题与缺失分母。
5. 用户确认一项值得接触的问题，生成访谈提纲；通过既有outreach记录真实反馈。
6. 若经营者说翻译不是难点、夜间异常才是，追加假设修正；系统建议改变观察任务的词组，用户确认后生成新版本。
7. 如果竞品发布免费功能，提示复查“替代方案不足”，关联受影响解释；不自动归档想法。
8. 用户作出Go/Kill，记录依据、未知与学到的内容；若归档，另存重新考虑的可观察条件。

以上均为设计示例，未声称已观察到这些搜索、客户回答或市场需求。

## 5. 数据获取清单

| 来源 | 可获取的数据/方式 | 联动目的 | 限制与第一步 |
|---|---|---|---|
| 既有内部记录 | 观察、验证、预测、决定、归档理由 | 找历史经验、复查依据、跨想法影响 | 首选；按用户隔离、保留上下文与版本 |
| 公开招聘页 | 岗位职责、技能、地点、发布日期与页面变化 | 求职匹配；发现企业投入人力解决的任务 | 复用现有采集，不推断真实已入职人数或软件预算 |
| Google Ads关键词规划 | 关键词建议、平均月搜索量与分月历史指标 | 研究人们寻找什么、是否有季节性 | 使用官方账号/API资格；先做手动CSV导入，正式API接入前核对授权与配额 |
| Google Trends | 搜索关注的相对变化与相关查询（取决于可用导出/接口） | 跟踪关注变化、比较地区与时间 | 官方API当前Alpha需申请；无权限时手动导出，不接无保证的隐藏接口 |
| 搜索建议、相关查询、公开问答 | 实际可见的问题表述与链接 | 扩展问题词汇、发现未解决情境 | 优先人工摘录/允许的接口；自动补全不是热度榜，不以顺序推断搜索量 |
| e-Stat | 公开统计及元数据 | 人口、企业、行业和地区分母 | 核对表定义、统计周期、地域、单位和修订；不能把机构数当潜在购买人数 |
| 法人番号API | 企业名称、地址、变更等基本信息 | 统一企业身份，连接新闻、招聘与客户记录 | 以法人番号为明确标识；不把分支、品牌和母公司自动混为一体 |
| Gビズインフォ | 公开补助、采购、专利等企业活动 | 发现购买任务、政策使用和实际投入 | 公开收录有边界；政府采购样本不代表全部客户 |
| EDINET及企业IR | 法定披露、经营与投资相关原始材料 | 核对新闻、追踪承诺落地 | API配置及文件解析；不覆盖所有中小企业，不把披露缺失判成无行为 |
| 竞品公开页面 | 定价、功能、帮助文档、更新记录 | 复查差异化、替代方案和切换障碍 | 每站核对访问/保存权限；登录和付费墙后的内容不默认采集 |
| 自愿提供的客户反馈 | 访谈、询价、试用、成交/停止原因 | 真实验证与Go/Kill依据 | 用户输入/授权导入，记录情境；不扩展收集无关个人信息 |
| 自有产品行为 | 查询、无结果、关键任务完成、重复使用、询价与付款 | 从真实使用发现未解决问题 | 原型存在且已明确告知才接入；定义事件口径、保留期与删除方式 |

不是所有来源都要接。每个采集任务先回答：它能改变哪个决定、补哪块缺口；无对应问题时不启动持续采集。

### 5.1 搜索数据必须区分的东西

- 搜索建议：发现表述，不等于查询频次。
- 搜索量：供应商口径下的估计，可能合并近似词，不等于人数。
- 搜索趋势：相对关注变化，不等于市场规模；网页导出与API标度分别存储，不统一假装0–100。
- 公开讨论：可见平台样本，不等于沉默用户或整个市场。
- 站内搜索：只代表进入自己产品的人，不代表所有搜索引擎用户。
- 询价、预约、付款：具体行为记录，不直接推出持续需求和可扩张商业模式。

## 6. 观察任务与数据契约

以下为新增领域的建议契约，实施计划须将其映射到实际SQL、类型、接口和RLS。

### 6.1 观察任务

保存：owner、关联决策对象、信息缺口、希望改变的决定、待查问题、来源、地区、语言、时间范围、过滤条件、种子词及由来、固定词组、探索词组、停止条件、运行方式、当前版本。

首版运行方式为manual。周期性运行后接，需独立调度、配额、失败通知及暂停；cadence字段不能伪装成任务已经自动运行。

修改关键词、平台、地域、语言、过滤或指标定义，必须生成配置新版本。固定观测与探索观测分别保存：探索发现不能直接混入固定样本的时间趋势。

### 6.2 一次采集运行

保存：任务版本、发起者、开始/完成时间、来源实际数据期、请求条件、运行状态、原始快照/可保存摘要、解析版本、返回范围、分页/截断、供应商计量与费用（仅接口实际提供时）、错误及重试身份。

状态区分成功、部分成功、失败、不可用。零结果、低量抑制、未知和接口失败分别记录；不以0或“无需求”统一表示。同一请求重复提交不得生成重复业务记录。

### 6.3 观测与解释

观测保存原文、数值/单位、地域/时间/群体/定义、来源引用、采集运行ID、来源声明的近似/修订信息。解释单独保存引用和用户/AI来源；不得覆盖观测。

数字只有在指标定义、单位、周期和地域可比时才比较。原始数值与转换结果并存；货币换算和通胀调整须有规则与来源，不让模型自行补数。

### 6.4 跨模块关联

关系最少表达：材料依据、影响的假设、支持/挑战的具体解释、共同企业、下一次行动、由何反馈修正、重新考虑条件。关系带owner、两端、用途说明、引用、确认/撤回历史。

先使用精确ID、法人番号、明确引用；名称相似、主题相似只产生候选，不自动合并主体，不推断因果。两端均须属于当前用户可访问范围；关联不能造成私人材料泄露。

## 7. 实施顺序与每期验收

### P0：完成已有事件档案发布闭环

- [ ] 执行迁移105–107后运行 `npm run db:check -- --events`，字段和RPC检查通过。
- [ ] 完成双账号、三个真实事件、真实Gemini选中范围与引用验收。
- [ ] 提交明确功能文件，排除用户已有 `.claude/launch.json` 修改；部署与开关按既有发布说明处理。

出口：确认真实数据闭环可用，再接新数据。此次规划不执行上述动作。

### P1：当前决策与观察任务基础（第一优先）

**复用/修改：** `app/(app)/workbench/{page.tsx,queries.ts}`、`lib/domains/closures/`、`lib/domains/ideas/{info-gaps.ts,info-gaps-shared.ts}`。

**拟新增：** `lib/domains/observations/{domain,queries,commands,imports}.ts`及对应测试；`app/(app)/workbench/observation-task-panel.tsx`、`app/(app)/workbench/observation-actions.ts`；新增兼容迁移。

- [ ] 扩展现有工作台，展示当前决策、关键未知、已有依据、观察任务和下一次行动。
- [ ] 从一个信息缺口创建任务，支持手动运行、CSV/人工摘录导入和配置版本。
- [ ] 实现运行/快照/引用/幂等与RLS，不要求每条捕捉先关联决策。
- [ ] 导入先显示格式、记录数、地区、日期、单位及无法解析的行，确认后保存；不能把半个文件悄悄当全量。

验收：两个用户互不可见；重试不重复；旧版本可查；缺值不填0；修改地域后不拼接旧趋势；没有新迁移时旧工作台仍可用。用一个真实决定完成“缺口→观察→材料→下一步”全流程。

### P1A：暂时接触不到人的验证路径（紧接P1）

**详细代码设计：** 第12节。共用P1观察任务、运行与引用基础；独立保存实验版本、样本与结果，不把测试写进真实接触表。

- [ ] 从信息缺口选择当下可用资源：公开材料、自己运行原型、公开小样例、真人接触；不分析用户私人资料来猜测。
- [ ] 用确定性规则提供可执行路径：前提排除、任务重建、原型测试、自愿公开试用、暂存待接触问题。允许多条路径并行，不形成新想法状态。
- [ ] 创建实验卡：检验什么、用什么输入、具体步骤、通过/不通过判据、时间/费用上限、能说明什么、不能说明什么。
- [ ] 保存公开样本与合成样本来源，执行后逐条记录结果、实际人工补救和资源消耗。
- [ ] 没有接触条件时保留必须问真人的问题；条件变化后追加新的验证任务，旧记录保持可查。
- [ ] 修改现有“拿不到数据”的绝对化提示，展示当前可执行路径和限制；不修改锁定规则。

验收：用户不接触任何真人也能完成一次有出处的前提核对及原型测试；系统明确展示技术/流程测试范围，has_pain和will_pay仍未被自动填写。假设不成立时用户可以归档；系统不自动Go/Kill。

### P2：搜索问题研究（P1A之后）

**拟新增：** `lib/domains/observations/search/{domain,imports,comparability,queries}.ts`及测试；`app/(app)/workbench/search-observation-panel.tsx`。

- [ ] 先支持Google Trends及关键词规划导出导入，保存供应商、导出版本和口径；只支持已验证格式。
- [ ] 分开显示AI种子词、来源建议词、实际观测词；用户可删改词组。
- [ ] 区分问题、替代、价格、切换等研究用途；这些是查询用途，不是证据强弱等级。
- [ ] 固定词组与探索词组分开；控制地区、语言、周期、平台，展示季节性和可比范围。
- [ ] 对反复出现但答案缺失的问题生成待验证观察，用户确认后关联想法和outreach提纲。
- [ ] 官方API凭证可用后再替换导入路径；记录配额、费用上限和来源中断，保留手动路径。

验收：输入合成AI词不能显示为真实热门词；搜索建议不能显示搜索量；近似词合并不当作独立人数；缺权限可导入；失败/低量抑制/零结果可区分。用同一问题做两次配置相同的运行，再改地区，验证比较边界。

### P3：企业身份与实际行动（第三优先）

**复用：** `lib/domains/jobs/{search,postings}.ts`、`app/(app)/companies/`、事件快照。

**拟新增：** `lib/domains/observations/companies/{identity,activity,providers}.ts`及测试；`app/(app)/companies/company-observations-panel.tsx`。

- [ ] 先接法人番号基础身份；以明确ID连接企业、新闻和招聘，模糊匹配需确认。
- [ ] 复用岗位任务，联动个人求职能力与创业访谈问题；不复制完整求职流程。
- [ ] 接Gビズインフォ采购/补助的一个可访问来源，保留原始要求与样本边界。
- [ ] 保存竞品价格/功能与更新快照；新增替代方案后提示复查相关假设。
- [ ] 建立“宣布→采取行动→经营结果”的可引用记录；没有后续只标未观察到。
- [ ] EDINET作为下一适配器，只有前面链路可维护后启用，不在首批解析全部披露类型。

验收：同名公司不串档；品牌/母公司/分支不自动合并；岗位发布不变成已招聘；公开采购不变成全部市场需求；抓取失败不报告降价或下架。

### P4：接触结果、跨想法学习与归档条件（第四优先）

**复用/修改：** `app/(app)/outreach/`、想法详情、validations、`app/(app)/learnings/`、决策工作台。

**拟新增：** `lib/domains/observations/feedback/{links,scope,reconsideration}.ts`及测试；`app/(app)/workbench/feedback-impact-panel.tsx`。

- [ ] 从观察缺口生成具体接触提纲，用户手动执行并记录，不自动发送。
- [ ] 真实反馈关联到对应假设，按既有规则录入has_pain/will_pay，不让搜索或模型代填。
- [ ] 同一反馈影响多个想法时，逐项给出适用范围和复查建议；确认后关联。
- [ ] 反馈改变关注方向时先展示词组/来源差异，确认后新建任务版本。
- [ ] 归档保存“学到了什么”和可观察的重新考虑条件；触发后提示复查，不自动恢复状态。

验收：单个客户回答不能自动推广行业；客户原话和模型摘要可分；归档唤醒有实际条件出处；同一条件不重复通知；撤回关联仍保留历史。

### P5：来源纠错、解释质量与注意力管理（第五优先）

**复用：** 事件研究日志、预测/判断历史、工作台与信息缺口；从决策已经引用的材料开始，避免扫描所有历史。

**拟新增：** `lib/domains/observations/reasoning/{claims,corrections,comparability,disagreements,mechanisms}.ts`及测试；`lib/domains/observations/attention/{contracts,sampling}.ts`及测试；相关详情嵌入面板。

- [ ] 信息增量：区分新事实、新独立材料、重复转述；不能仅凭文字相似认定无新增。
- [ ] 分母缺口：把样本与群体范围并列展示，未找到分母时不外推。
- [ ] 事实更正追溯：来源修订找到受影响引用/解释/判断，追加提示，不覆盖历史结论。
- [ ] 数字口径检查：单位、周期、地域、名义/实际值、金额/数量不一致时解释不可比原因。
- [ ] 分歧解剖：区分事实分歧、定义分歧、时间范围、机制和价值取向，提出可核对的问题。
- [ ] 传导链：每一环有引用、反例或未知，起点确认不推导终点已发生。
- [ ] 标题阅读实验：自愿先看出处材料、再看标题和解读；不做常驻考试，不评分。
- [ ] 适用条件：跨地区/行业类比保存关键条件与失效条件，条件变化提示复查。
- [ ] 阅读约定：用户定义什么变化值得提醒；可编辑、可退出、可看全部，不静默屏蔽反证。
- [ ] 固定样本回看：从功能启用日起按预先保存规则留样，包括跳过项；不伪造历史曝光、不事后只挑成功案例。

验收：转载新增关键事实不能被跳过；修订不删除旧快照；定义不明时不强作比较；机制连线不表达已证因果；没有满足阅读约定也能查看全部；回看样本规则不可事后悄悄改写。

### P6：统计分母、自有产品与长期自动运行（后续扩展）

**拟新增：** `lib/domains/observations/statistics/`、`product-events/`、`scheduling/`及对应测试；按实际独立一期写实施计划。

- [ ] 接e-Stat单个已验证统计表，保存元数据和修订；扩展之前先完成一个市场分母案例。
- [ ] 当真实原型存在时接查询/无结果/关键任务/回访/询价/付款；先定义事件和告知，再采集。
- [ ] 将原型反馈关联验证与决策，不把点击当痛点、不把一次付款当长期成立。
- [ ] 按来源增加有预算上限的定时运行、退避重试、停用、健康状态和删除策略。
- [ ] 新来源先提供样本预览与可比性检查，通过后再进入持续任务；无授权/无接口时明确不可用。

验收：后台重复执行不重复记账；超预算停止且可见；停用后不继续抓取；删除授权数据能清理派生引用或显示已删除占位；调度故障不变成“需求下降”。

## 8. 阅读增强创意覆盖核对

| 本轮创意 | 实施位置 |
|---|---|
| 信息增量、放心跳过重复报道 | P5 |
| 被忽略的分母/沉默样本 | P5先展示缺口，P6接统计 |
| 承诺是否付出实际成本 | P3 |
| 去掉标题看材料 | P5自愿实验 |
| 跨地区/行业适用与失效条件 | P5 |
| 更正追溯被影响的判断 | P5 |
| 数字口径、分歧解剖、传导链 | P5 |
| 阅读约定、固定样本回看 | P5 |
| 当前决策组织整个系统 | P1复用工作台 |
| 新闻触发假设复查与接触 | P1关联，P4行动闭环 |
| 验证反向调整关注 | P4 |
| 一次验证影响多个想法 | P4 |
| 归档的重新考虑条件 | P4 |
| 搜索问题、数量、变化、未解决情境 | P2 |
| 可重复的主动采集方法 | P1契约，P2检验，P6调度 |
| 招聘联动求职/创业 | P3 |
| 企业身份、采购/补助、披露、竞品 | P3 |
| 内部历史、访谈及业务行为 | P1/P4，真实原型后P6 |
| 暂时接触不到人的验证路线 | P1A及第12节 |
| 公开任务重建、前提排除、样本测试 | P1A及第12节 |
| 验证边界、未知保留、以后续接真人 | P1A及P4 |

## 9. 验证、发布与停止标准

每期独立提交与功能开关，默认关闭；新迁移先兼容旧路径，按owner做RLS和服务端校验。不得为了后续计划把当前大批未提交产品代码一起提交。

验证命令：

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm run db:check
```

新增领域先有行为测试，实际SQL引擎测试owner、两端关系、幂等、事务回滚、不可变历史；浏览器测试失败保留输入、截断/分页、手机和缺迁移。新增来源使用固定脱敏夹具；实机请求只在凭证与用途明确后执行，不把模拟通过当接入成功。

每一期用真实案例回答：它改变了哪个决定或下一步行动？是否减少了重复阅读和重复验证？用户是否能准确区分原始观测、解释和未知？这些用于复盘，不变成想法分数。

以下情况先暂停扩展该来源、保留手动路径：无法解释覆盖人群；口径持续不可比；获取不稳定且无法恢复；费用无法约束；采集只增加材料却没有对应缺口。已经保存的历史不因停用被抹掉。

## 10. 数据来源依据与实施时复核

以下为本轮讨论核对过的官方入口。接入前重新确认权限、配额、格式、使用与保存条件；本计划不承诺永久可用、全部免费或覆盖全部市场。

- Google关键词建议及历史指标：https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas
- Google关键词规划与月度更新：https://developers.google.com/google-ads/api/docs/keyword-planning/overview
- Google Trends API Alpha：https://developers.google.com/search/apis/trends
- Google Trends网页数据解释：https://support.google.com/trends/answer/4365533
- 自动补全不是热门查询排名：https://support.google.com/websearch/answer/7368877
- e-Stat API：https://www.e-stat.go.jp/api/
- 国税厅法人番号API：https://www.houjin-bangou.nta.go.jp/webapi/
- Gビズインフォ API：https://content.info.gbiz.go.jp/api/index.html
- EDINET官方文档：https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0110.html

现有 `lib/domains/ideas/info-gaps-shared.ts` 明确保留人工搜索链接，并注明知恵袋搜索页及Google联想不用于批量抓取。后续沿用这一保守边界，不能把“人工可看”当成“可以自动批量采集”。

## 11. 下一步交付定义

推荐第一批执行P1 → P1A → P2，前提是P0发布闭环完成。结果应是：用户能从真实决策建立观察任务；即使暂时接触不到人，也能用公开材料核对前提、完成可检查的小交付；搜索材料帮助发现后续问题，接触条件成熟时再接真实反馈。

P3–P6保留完整方向与验收条件，按前一期实际使用反馈调整先后，不因路线图列出就一次性建设全部来源。每期实施计划需要补齐准确SQL、接口签名、具体测试输入和部署操作；本路线图不替代这些实施设计。

## 12. 接触条件有限时的代码实现设计（P1A）

### 12.1 复核现有代码后确定的切入点

- `lib/domains/ideas/info-gaps-shared.ts` 的 `UNOBTAINABLE_ADVICE` 已有“拿不到”的提示，但其中把接触困难直接推向Kill的表述应改为有条件的判断：记录渠道约束、提供可执行分支、保留市场需求未知。`GAP_STATUS`沿用open/got/none，不新建想法状态。
- `lib/domains/ideas/info-gaps.ts` 的 `generateIdeaGaps` 会删除open且无evidence的旧缺口。接入观察任务/实验后，已被引用的缺口不得硬删除；保留原行与新记录，UI可展示旧问题。数据库FK采用restrict而非级联删掉实验。
- 同文件 `addGapEvidence` 当前以读数组再写回方式追加；未来实验引用必须用带请求ID的RPC锁行追加，避免两次提交互相覆盖。仍使用原GapEvidence形状，并增加可选 `experiment_id`、`experiment_run_id`，旧记录兼容读取。
- 同文件 `setGapStatus` 标got后可能调用 `touchIdea`。新增实验保存路径不能自动调用setGapStatus、touchIdea或解锁入口；只提供查看/引用与用户自主决定。既有锁定相关行为保持原样，不借本期重写。
- `app/(app)/ideas/actions.ts` 的 `addValidation` 专门写真实接触；不接收原型测试或合成客户内容。P1A通过单独的commands/RPC保存，不能复用addValidation“省一张表”。
- 材料入口 `app/(app)/materials/{ingest,queries,types}.ts` 已有文本/URL/文件及AI流程。只复用owner检查、提取结果与快照，不默认调用AI流水线，不把公开论坛用户的话标为当前用户访谈。

### 12.2 实现方式选择

| 方式 | 取舍 |
|---|---|
| 只改“拿不到”提示词 | 无法执行、保存和复查，不采用为完整实现 |
| 把所有测试塞入validations | 混淆真实接触与自测，违反验证边界，不采用 |
| 在信息缺口里嵌入实验卡，独立追加记录 | 复用入口与资料，类型明确、可续接真人；采用 |

无需新建“无接触模式”页面或全局模式开关。每个任务可独立配置资源，用户有时能接触A行业、接触不到B行业时不会互相影响。

### 12.3 最小领域契约与确定性路由

拟新增 `lib/domains/experiments/domain.ts`：下列类型与函数是实施时的接口契约，保存在本文，不代表已写入产品。

```ts
export type ExperimentObjective = 'premise' | 'workflow' | 'delivery' | 'demand';
export type AccessContext = {
  publicSources: boolean;
  canRunPrototype: boolean;
  canPublishExample: boolean;
  canContactPeople: boolean;
};
export type ExperimentRoute =
  | 'public_check' | 'task_reconstruction' | 'prototype_test'
  | 'opt_in_trial' | 'direct_contact' | 'deferred_contact';

export function availableRoutes(a: AccessContext): ExperimentRoute[] {
  const routes: ExperimentRoute[] = [];
  if (a.publicSources) routes.push('public_check', 'task_reconstruction');
  if (a.canRunPrototype) routes.push('prototype_test');
  if (a.canPublishExample) routes.push('opt_in_trial');
  if (a.canContactPeople) routes.push('direct_contact');
  else routes.push('deferred_contact');
  return routes;
}
```

这是可用入口集合，不是建议按固定顺序全部做一遍。没有材料时可运行合成输入原型测试，但不能声称覆盖真实任务；没有任何可运行资源时只保存约束、未答问题和重新检查日期，不编造行动。

每张卡必须声明objective和limits。`demand`在无实际外部反馈时只能保留unresolved；有反馈也不能在该表填写has_pain/will_pay，用户回到既有真实验证入口明确记录。

`boundaries.ts`对外契约为 `summarizeExperimentBoundary(input): ExperimentBoundary`。input包含objective、caseOrigins（案例来源）、executionContexts（执行上下文）、reportedOutcomes（逐案测试结果）、hasAttributedFeedback（是否有明确归属的反馈记录）。返回类型如下：

```ts
export type ExperimentBoundary = {
  checked: string[];
  stillUnknown: string[];
  nextQuestions: string[];
  demandConclusion: 'unresolved';
};
```

本实验域始终不输出需求yes/no。即使提供外部反馈，也仅在checked中说明发生了什么、引用何处，再跳转真实验证入口由用户记录。需求实验可以完成运行而问题仍未知，不能把运行completed解释成假设成立。服务端从已保存case/run记录重算边界，不接收客户端声明的“已验证市场”。

### 12.4 数据结构与迁移约束

拟新增四张表，具体迁移编号执行前分配。全表owner隔离，service-role写入也显式校验owner。使用复合外键绑定同一用户和同一想法，不能只验证主键存在。

| 表 | 必要字段 | 约束与用途 |
|---|---|---|
| `idea_experiments` | id,user_id,idea_id,gap_id nullable,series_id,revision,objective,route,access_context,question,hypothesis_snapshot,gap_snapshot,input_plan,steps,pass_criterion,fail_criterion,limits,time_budget_minutes,cost_budget_minor,currency,deferred_questions,recheck_on,client_request_id,created_at | 版本行不可覆盖；unique(user_id,series_id,revision)、unique(user_id,client_request_id)；预算可空、非负，金额整数小单位且币种明确；gap必须属于同一idea |
| `idea_experiment_cases` | id,user_id,idea_id,experiment_id,input_origin,input_text,source_snapshot,expected_output,created_at | input_origin为public/owned/synthetic，表示来源而非强弱；public须有可追溯来源及实际摘录，owned只保存授权材料；synthetic不能伪造发布方或真实用户 |
| `idea_experiment_runs` | id,user_id,idea_id,experiment_id,case_manifest,started_at,finished_at nullable,status,actual_minutes,actual_cost_minor,currency,output_artifact,client_request_id | 冻结实验版本及样本清单；status为running/completed/failed/cancelled，独立于想法状态；只有RPC允许running转终态，终态内容不可覆写 |
| `idea_experiment_results` | id,user_id,idea_id,run_id,case_id,execution_context,outcome,actual_output,manual_intervention,notes,client_request_id,created_at | unique(user_id,run_id,case_id)，outcome为pass/fail/unresolved，仅针对预先定义的该项测试；execution_context为self_run/ai_simulation/external_feedback，表示谁执行/反馈，不是评分 |

case新增后只对未来run可见；已完成结果的纠错用新run引用旧run，保留原记录。来源快照至少包括source_type、source_id或URL、发布方、发布时间（可空）、captured_at、实际摘录、hash、捕获范围；原文缺失、摘录被截断必须可见。复用P1快照记录时以同owner不可变ID引用，同时保存必要显示快照；不能只链接会更新的网页。

结构化字段使用jsonb并以服务层和SQL双重校验：access_context对应AccessContext；input_plan明确输入范围，task_reconstruction保存role、trigger、inputs、steps、current_alternative、obstacles、refs、unknowns；output_artifact只保存用户选择的材料ID/URL和说明，URL不触发自动抓取；actual_output保存逐案输出文本及可选工件引用。文本/摘录按现有材料上限裁剪前先提示，不隐式截断实验判据。预算未设则为null，不生成虚构币种、0成本或剩余额度。

不保存第三个“需求强度”字段，不在实验里新增has_pain/will_pay副本。无法引用合法保存内容时，仅记链接和限制，不能伪造摘录。

### 12.5 服务、RPC与UI文件边界

| 文件 | 职责 |
|---|---|
| 新增 `lib/domains/experiments/domain.ts` | 上述类型、可用路线、字段校验、确定性边界说明；可供客户端使用，不导入密钥 |
| 新增 `lib/domains/experiments/queries.ts` | 按用户列版本、样本与运行，分页；仅识别本领域缺表为missing-schema，其他数据库错误不能吞掉 |
| 新增 `lib/domains/experiments/commands.ts` | 保存实验版本/样本、开始/完成运行、追加缺口引用；显式owner、幂等和原文检查 |
| 新增 `lib/domains/experiments/boundaries.ts` | 由objective、输入来源、执行上下文、结果生成“已核对/仍未知/下一步”范围说明，不用AI生成需求结论 |
| 新增 `app/(app)/ideas/experiment-actions.ts` | 会话和功能开关检查、服务调用、revalidatePath；页面提交不自动调用AI |
| 新增 `app/(app)/ideas/[id]/experiment-panel.tsx` | 展示资源选择、可用路线、实验版本、运行与边界；失败保留输入，显式busy/ref防重复 |
| 修改 `app/(app)/ideas/[id]/info-gaps-panel.tsx` | 从缺口展开“暂时接触不到人，也能核对什么”，展示实验引用，不往已有大idea-detail组件继续堆实现 |
| 修改 `app/(app)/workbench/queries.ts` | 聚合未解决问题、可执行实验和待续接的真人问题；不按完成实验数量给想法排序 |
| 修改 `app/(app)/ideas/[id]/timeline/queries.ts`、`timeline-view.tsx` | 新增“原型/公开资料核对”时间线事件，文案区别于真实接触；不改变idea状态枚举 |
| 修改 `lib/domains/ideas/info-gaps.ts`、`info-gaps-shared.ts` | 保护已关联缺口、原子追加引用、兼容旧evidence、改进拿不到提示 |

RPC建议名：`save_idea_experiment_version`、`append_idea_experiment_case`、`start_idea_experiment_run`、`complete_idea_experiment_run`、`attach_experiment_gap_ref`。每个都接收user、目标ID、request_id；版本/运行事务锁定相关实验行；输入重用request_id但payload不同必须报冲突，不能误返旧结果。complete一次提交全部结果并验证case_manifest，失败整笔回滚，防止页面只保存部分样本却显示完成。

### 12.6 从UI到保存的具体流程

1. 用户在信息缺口选择当前可用资源。用availableRoutes本地显示入口，不先调用AI、不要求私人履历。
2. 选择“前提核对”：填写待否定条件、允许的来源，引用公开材料；结论可以是前提被反驳、尚未反驳或未知，不能把尚未反驳写成已成立。
3. 选择“任务重建”：在卡中记录角色、触发情境、输入、步骤、当前替代方案、障碍、每项引用及未知；首版用结构化表单，AI提取为后续可选草稿，需逐项引用与确认。
4. 选择“原型测试”：先保存判据及样本，再start冻结清单，手动运行并保存输出/人工补救。首版只保存结果与工件链接，不提供任意脚本执行或自动访问用户给定URL的运行器。
5. 选择“自愿公开试用”：记录计划发布渠道与实际曝光（未知则空）、试用/反馈及用途告知；首版仅支持手动记录，不负责自动发布、广告或第三方追踪。零试用且曝光未知时不能显示“无需求”。
6. 完成后显示边界：例如“公开规则下的三项输入已测试；未接触旅馆经营者；真实任务覆盖、痛点和付费仍未知”。这是说明范围，不是得分卡。
7. 用户可确认把运行引用附回信息缺口；是否标got由用户针对原问题决定，技术测试不能自动关闭需求问题。需要真人的未答问题持续保留。
8. 之后接触条件变化，创建新实验版本或outreach任务，带上需要核对的问题与旧结果链接；不回写旧run，不自动发送消息。

### 12.7 实施检查点与测试输入

按以下五个独立提交单元实施；每个单元先写失败测试、观察FAIL，再做最小实现、复跑PASS。提交只包含该单元明确文件。

**A. 类型和路线（新建domain.ts及domain.test.ts）**

```ts
import { expect, it } from 'vitest';
import { availableRoutes } from './domain';

it('无接触条件时仍有公开核对和自测入口，并保留待接触问题', () => {
  expect(availableRoutes({ publicSources: true, canRunPrototype: true,
    canPublishExample: false, canContactPeople: false })).toEqual([
    'public_check', 'task_reconstruction', 'prototype_test', 'deferred_contact',
  ]);
});
it('没有材料和运行条件时不编造实验', () => {
  expect(availableRoutes({ publicSources: false, canRunPrototype: false,
    canPublishExample: false, canContactPeople: false })).toEqual(['deferred_contact']);
});
```

运行：`npx vitest run lib/domains/experiments/domain.test.ts`。实现前应FAIL缺模块；实现后两项PASS。另测预算非负、判据缺失拒绝、objective/route枚举和文本长度，不以字符串扫描代替行为断言。

**B. SQL和commands（新迁移、commands.test.ts、postgres.integration.mjs）**

- 用户A实验引用B的case/material/gap：拒绝；同owner但另一个idea的gap：拒绝。
- 相同request重复start/complete：只一份；同request不同输入：冲突；并发创建revision不能重复。
- completed测试新增case后重放：原case_manifest不变；漏一个case提交complete：回滚并保持running。
- 重新生成信息缺口：已关联gap与实验均保留；并发attach两个不同run引用：两项均存在。
- 原型测试全部pass后检查DB：validations行数、ideas.status、last_activity_at以及既有锁定相关数据均未被该保存路径修改。
- 新增表不允许authenticated绕过RPC更新终态记录；缺迁移显示功能不可用，不影响原信息缺口。

运行：`npx vitest run lib/domains/experiments/commands.test.ts`；实际SQL引擎使用 `node lib/domains/experiments/postgres.integration.mjs <PGlite入口绝对路径>`。本机入口路径从已安装runtime定位，不提交机器专用路径。

**C. 边界说明（boundaries.ts及boundaries.test.ts）**

- public输入+self_run+delivery+全部pass：checked仅说明所选输入下交付测试通过，demandConclusion仍为unresolved，stillUnknown保留真实任务适用性和客户需求。
- synthetic输入+ai_simulation+全部pass：说明模拟流程结果，不能称真实用户、公开需求或客户认可。
- demand实验没有external_feedback：unresolved；曝光未知+零试用：不能得出无需求。
- 前提核对没有反证：显示尚未反驳，不能显示已证实；存在明确反证则附原文，交给用户决定。
- 外部反馈与真实validation分开显示：不自动填写二元信号，不因提供一条好评就推导愿意付钱。

运行：`npx vitest run lib/domains/experiments/boundaries.test.ts`，上述五类输入须逐项断言返回的范围字段，不只匹配提示词。

例如服务层完成运行后，测试必须断言 `summarizeExperimentBoundary({ objective: 'delivery', caseOrigins: ['synthetic'], executionContexts: ['ai_simulation'], reportedOutcomes: ['pass'], hasAttributedFeedback: false }).demandConclusion === 'unresolved'`，同时验证保存前后validations没有新增；不以UI上的一句免责声明代替数据库边界。

**D. 页面与原有入口（actions.test.ts、experiment-panel.test.tsx、info-gaps-shared.test.ts）**

- 无账号、功能关闭、跨用户ID都拒绝；服务端不能信任客户端传来的owner。
- 表单保存失败保留实验判据与样本，重试沿用请求身份；成功后才清理请求。
- 长原文、无来源、合成输入标注、未完成run、待接触问题在手机界面可见。
- 原有捕捉及真实验证入口照常工作；不增加必填实验或人脉资料。
- “拿不到”的提示提供前提核对/原型路径与接触限制，不承诺因此确认市场需求。

**E. 浏览器及发布**

新增 `scripts/verify-experiment-paths.mjs`，沿用现有真实组件+延迟服务边界夹具：公开样本→实验→失败重试→完成→边界展示→附回缺口→资源变化续接。浏览器断言未调用addValidation、无自动AI请求、无自动外链发布；夹具不能替代真实Supabase双用户验收。

新增 `IDEA_EXPERIMENTS_ENABLED`，默认关闭；缺开关/缺表保留原页面。先迁移和owner/事务检查，再部署测试环境，人工完成一次公开材料核对与一次合成样本自测，确认二者不被显示为真实需求验证后再开启。回退关闭开关、保留历史。

本节只设计新增保存/查询路径，明确不修改或新增锁定机制；如果实现中发现绕不过既有锁定相关副作用，应调整调用边界，不顺带改锁定政策。
