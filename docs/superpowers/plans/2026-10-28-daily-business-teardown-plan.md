# 每日一门生意：分期实施计划

> 2026-10-29执行更新：A–D代码与本地验收已完成；本文件保留最初任务拆分，最新状态及证据以`2026-10-28-business-teardown-progress.md`和`2026-10-29-daily-business-teardown-delivery.md`为准。真实乐天接口验收仍待Access Key，远端迁移与生产启用未执行。

> **For agentic workers:** 实施时使用 subagent-driven-development 或 executing-plans；先读本计划及对应产品设计。当前任务仅写方案，不代表已经开发、取得平台授权、同意新AI数据范围或启用生产任务。保持现有未提交依赖，不自动提交/部署。

**Goal:** 每天提供一家不重复店铺的可核对经营拆解，用主商品和对照店解释购买过程、履约、成立条件及可做的验证。

**Architecture:** 独立的business-teardowns领域保存店铺身份、来源快照、每日槽位、报告版本及用户动作。先以人工确认候选打通端到端阅读，再接每日自动候选轮换和独立预算任务。纯比较/引用校验可以复用；现有e-Stat专用SQL调度、事件snapshot ID和用户私人AI许可不能直接挪用。

**Tech Stack:** Next.js14 App Router、TypeScript、Supabase PostgreSQL、Tailwind/shadcn、现有lib/ai统一入口与AI_MODEL、Vitest/PGlite/Chrome。

产品依据：[完整设计](../specs/2026-10-28-daily-business-teardown-design.md)。本计划中的类型、接口和迁移名是拟新增契约，不表示当前仓库已存在这些功能。

## 0. 已核对基础和实施边界

| 当前文件/模块 | 复用内容 | 不能直接复用的部分 |
| --- | --- | --- |
| `lib/rakuten.ts` | 商品搜索2026-07-01、Key/Referer设置 | 新功能需要预算钩子、限制响应、脱敏错误/返回值，不能沿用可能含原始响应的日志 |
| `lib/ai/shared.ts`、`lib/ai-gateway.ts`、`lib/ai/index.ts` | 统一Gemini调用、模型变量、错误和用量记录 | 不绕过gateway，不沿用事件研究的授权 |
| `lib/domains/observations/reasoning/` | 纯比较与显式依赖的设计 | 不给商店新建假的signal_event ID来写旧日志 |
| `lib/domains/observations/scheduling/` | 租约、请求记账、回执的可测试机制 | 118表与函数绑定统计配置，只允许e-Stat；新店铺任务需独立契约 |
| `lib/domains/experiments/commands.ts` | 用户确认后的实验保存 | 不把阅读或AI模拟作为真实需求验证 |
| `app/(app)/workbench/connected-form.tsx` | busy、防重、失败保输入、保存/刷新区分 | operation需绑定案例版本/目标ID/授权版本等表单外上下文 |
| `components/app-navigation.ts`、`components/app-shell.tsx` | 成长导航、图标与活动路由规则 | 新入口受开关控制，不破坏现有固定导航测试 |

第一版只发送选择过的公开店铺/商品字段和去标识公开摘录给AI。私人笔记、反馈、原型事件、订单及买家身份不进入本模块AI输入。当前没有为新模块发起API实机业务请求或Gemini请求。

## 1. 固定领域契约

文件根目录：`lib/domains/business-teardowns/`。

```ts
type Platform = 'rakuten' | 'xiaohongshu';
type MaterialOrigin = 'official_api' | 'public_excerpt' | 'manual_excerpt';
type Reference =
  | { snapshotId: string; quote: string }
  | { snapshotId: string; metricId: string };

type QuantityObservation = {
  id: string;
  metric: 'pack_contents' | 'units_per_order' | 'displayed_sales'
        | 'review_count' | 'repeat_mention';
  raw: string;
  value: number | null;
  relation: 'eq' | 'gte' | 'unknown';
  unit: 'pieces' | 'packs' | 'orders' | 'buyers' | 'mentions' | 'unknown';
  period: { from: string | null; to: string | null; label: string | null };
  sampleScope: string;
  attribution: 'platform' | 'merchant' | 'review_excerpt' | 'user_supplied';
};

type MaterialSnapshot = {
  id: string; merchantId: string; platform: Platform;
  itemId: string | null; origin: MaterialOrigin; sourceUrl: string;
  capturedAt: string; publishedAt: string | null;
  captureScope: 'api_fields' | 'excerpt' | 'manual_transcription';
  capturedText: string | null; quantities: QuantityObservation[];
  structured: Record<string, unknown>; coverage: string; contentHash: string;
};

type CaseSection = {
  key: 'offering' | 'trigger' | 'buyers' | 'volume' | 'journey'
     | 'value' | 'operations' | 'economics' | 'comparison'
     | 'failure_conditions' | 'transfer' | 'experiment';
  observations: { metricId: string; snapshotId: string }[];
  interpretations: {
    text: string; refs: Reference[];
    competingExplanation: string; distinguishingObservation: string;
  }[];
  unknowns: string[];
};

type DailyCase = {
  id: string; localDate: string; timezone: 'Asia/Tokyo'; merchantId: string;
  state: 'preparing' | 'ready' | 'unavailable';
  publishedRevisionId: string | null; failureReason: string | null;
};

type CaseRevision = {
  id: string; caseId: string; revision: number;
  primarySnapshotIds: string[]; comparisonSnapshotIds: string[];
  inputManifestHash: string; sections: CaseSection[];
  authorship: 'manual_template' | 'ai_draft';
  promptVersion: string | null; model: string | null; createdAt: string;
};
```

这些是来源和报告契约，不是想法状态或证据强弱等级。店铺销量字段始终null-safe；不新增商机分数、信心百分比、顾客画像评分。

## 2. 拟新增数据库与API

实施前重新检查最大迁移号；当前最后为118，下面119–122为本计划的顺序建议，不覆盖其他任务的新迁移。

| 迁移 | 核心表 | 关键约束 |
| --- | --- | --- |
| `119_business_teardown_foundation.sql` | business_merchants、business_material_snapshots、business_daily_cases、business_case_members、business_case_requests | 店铺ID owner隔离；每日和主店唯一；快照/当日成员冻结；请求冲突检测 |
| `120_business_teardown_research.sql` | business_case_revisions、business_ai_consents、business_case_lessons、business_case_action_refs | 报告版本不可覆盖；输入清单/授权范围绑定；用户确认沉淀；桥接幂等 |
| `121_business_teardown_jobs.sql` | business_selection_rules、business_case_jobs、business_case_budgets、business_case_attempts | 独立商店来源allowlist、日预算/租约/fencing；授权撤回与源停用复核 |
| `122_business_teardown_followups.sql` | business_identity_links、business_case_expectations、business_case_followups、business_case_corrections | 身份修正追加历史；预期先于结果；补新材料，不改当初报告 |

基础约束示例：

```sql
-- 以下列均在119中定义，不使用客户端传入的日期作为权威日期。
create unique index business_merchant_platform_identity
on public.business_merchants(user_id, platform, platform_shop_id);
create unique index business_case_one_per_day
on public.business_daily_cases(user_id, local_date);
create unique index business_case_main_merchant_once
on public.business_daily_cases(user_id, merchant_id);
-- 追加的身份合并记录参与未来候选排除；既有两个历史槽位不强制改写成一个ID。
```

所有含user_id的关联用包含owner的复合外键或事务内双端owner检查。客户端只能读本人数据，写操作走服务端Supabase和窄RPC；安全定义函数固定search_path，先检查service角色和非空owner，再校验引用及版本。可变运行状态与不可变快照分表。删除来源清除允许删除的摘录与派生正文，保留无原文占位，不能从AI输入日志中恢复删除内容。

拟定服务接口：

```ts
reserveDailyCase(owner: string, input: {
  merchantId: string; requestId: string;
}): Promise<DailyCase>;
loadDailyCase(owner: string): Promise<DailyCase | null>;
listCaseHistory(owner: string, before?: string): Promise<{
  items: DailyCase[]; nextCursor: string | null;
}>;
saveMaterial(owner: string, input: {
  merchantId: string; snapshot: Omit<MaterialSnapshot, 'id' | 'capturedAt'>;
  requestId: string;
}): Promise<{ id: string }>;
generateCaseDraft(owner: string, input: {
  caseId: string; expectedRevision: number; snapshotIds: string[];
  comparisonSnapshotIds: string[]; consentId: string;
  requestId: string;
}): Promise<CaseRevision>;
publishCaseRevision(owner: string, input: {
  caseId: string; revisionId: string; expectedRevision: number;
  requestId: string;
}): Promise<DailyCase>;
previewCaseAction(owner: string, input: {
  revisionId: string; targetIdeaId: string;
  kind: 'observation' | 'experiment'; selectedText: string;
}): Promise<{ previewId: string; payloadHash: string; fields: object }>;
confirmCaseAction(owner: string, input: {
  previewId: string; payloadHash: string; requestId: string;
}): Promise<{ targetId: string }>;
```

saveMaterial不直接暴露为“客户端传任意official_api”的action。官方来源由适配器构建并保存；手动action只允许manual_excerpt。reserveDailyCase从DB时钟计算东京日期并取owner锁；已存在今日槽位时先返回，不接受换商家绕过每日约束。

## A期：材料与每日唯一案例

### A1 身份、槽位、历史

**新增文件：**

- `lib/domains/business-teardowns/{domain,identity,daily,commands,queries}.ts`
- 对应 `.test.ts` 和 `postgres.integration.mjs`
- `supabase/migrations/119_business_teardown_foundation.sql`

- [ ] 先写身份与数量类型测试，输入平台店铺ID、商品ID、带tracking参数的URL；断言身份使用稳定店铺ID，商品换ID不产生新店铺，名字相同也不能合并不同店铺ID。
- [ ] 增加真实SQL红测试：同owner当天两请求只能获得同一槽位；两个owner的历史互不影响；隔日再次选同店拒绝；跨东京午夜分别归入正确日期。
- [ ] 实现owner/service保护、复合owner外键、每日/主店唯一索引、请求载荷账本、东京日事务预留。失联重试先ack相同请求，换merchant复用UUID拒绝。
- [ ] 实现快照不可覆盖、分页历史和当日材料成员清单；failed/unavailable保留当天槽位，修复后仍处理同店，不伪造旧日曝光或补填历史日期。
- [ ] 运行 `npx vitest run lib/domains/business-teardowns/domain.test.ts lib/domains/business-teardowns/identity.test.ts lib/domains/business-teardowns/daily.test.ts`，预期全部通过；运行该目录PGlite脚本，确认并发/owner/午夜/不可变历史断言通过。

测试行为示例（函数由本任务实现，fixture为隔离数据库）：

```ts
it('same shop stays one business when the item changes', () => {
  const first = merchantIdentityFromItem({
    platform: 'rakuten', shopCode: 'sample-shop', itemCode: 'sample-shop:101',
  });
  const second = merchantIdentityFromItem({
    platform: 'rakuten', shopCode: 'sample-shop', itemCode: 'sample-shop:202',
  });
  const other = merchantIdentityFromItem({
    platform: 'rakuten', shopCode: 'other-shop', itemCode: 'other-shop:101',
  });
  expect(first.key).toBe(second.key);
  expect(first.key).not.toBe(other.key);
});
it('order quantities remain unknown when only pack contents exist', () => {
  const observed: QuantityObservation = {
    id: 'pack', metric: 'pack_contents', raw: '每包12枚', value: 12,
    relation: 'eq', unit: 'pieces',
    period: { from: null, to: null, label: null },
    sampleScope: '该商品页面的包装说明', attribution: 'merchant',
  };
  expect(orderQuantityFrom([observed])).toBeNull();
});
```

`merchantIdentityFromItem(input:{platform:'rakuten';shopCode:string;itemCode:string}):{platform:'rakuten';platformShopId:string;key:string}`从返回字段构造身份，要求itemCode所属shopCode一致，保留平台ID大小写语义，不猜测名称。`orderQuantityFrom(observations:QuantityObservation[]):QuantityObservation|null`只返回唯一的units_per_order且relation=eq显式观察，保留原样本范围；有多个不同下单叙述则交给页面分别列出，不在此计算平均值。包装、评价数或累计销量不能作为总体订单件数。

### A2 官方与手动来源

**新增：** `lib/domains/business-teardowns/providers/{rakuten,manual,shared}.ts`及测试/脱敏fixtures。

**修改：** `lib/rakuten.ts`、`lib/rakuten.test.ts`，为新旧调用保留兼容接口，安全处理错误/返回值。

- [ ] 固定官方host与版本，单独实现ranking和shop/item查询；每HTTP前接预算授权回调，拒绝重定向并限制响应字节/超时。Key不能进入日志、快照、错误或fixture。
- [ ] 先写脱敏测试：mock响应/错误回显applicationId与accessKey，任何保存输出/可见message都不含真实字符串；接口失败保持unavailable，不返回空销量成功。
- [ ] 解析店铺/商品ID、原价范围、币种、包装和榜单范围；保存原字段，价格区间不能擅取一个值。rank/reviewCount/displayed_sales用不同metric，不把搜索sort=-reviewCount叫销量榜。
- [ ] 评价文本若无明确、可用的来源接口，使用人工选择摘录；不从搜索API的reviewCount声称已抓到评论正文。
- [ ] manual入口只保存用户选定的公开材料和范围，去掉买家身份；无出处/范围时标明缺口，不冒充官方API响应。链接解析只支持明确平台host，未知跳转不跟随。
- [ ] 运行 `npx vitest run lib/rakuten.test.ts lib/domains/business-teardowns/providers`；随后只读核验一个真实店铺/主商品及排名返回，另行记录字段缺失，脱敏后保存fixture，不在本阶段调用AI。

### A3 材料页与最小闭环

**新增：** `app/(app)/business-lab/{page,actions,source-panel,history-panel}.tsx/ts`、`[caseId]/page.tsx`及组件测试。

**修改：** `components/app-navigation.ts`、`components/app-shell.tsx`、`app/(app)/dashboard/page.tsx`及其既有导航测试。

- [ ] 今日页显示同一槽位的准备状态/失败原因；材料、历史及快照可读，手动选一个已确认候选即可预览事实模板。
- [ ] 首批手动确认候选和对照店，记录选择原因/覆盖；页面不把候选准入写成机会推荐。
- [ ] 在成长组增加受 `BUSINESS_TEARDOWNS_ENABLED` 控制的“生意拆解”，今日行动只放简短入口，完整阅读在独立路由。关闭开关或缺119时旧页面不报错。
- [ ] 浏览器验证：同日刷新稳定、换设备仍同case、历史分页、包装量与订单量区分、失败保输入、手机无横向溢出。

**A期完成条件：** 没有AI也能核对一家店的材料与未知；日报唯一性由数据库保证，不依赖浏览器缓存。

## B期：可核对的完整拆解与动作

### B1 冻结材料、Gemini草稿和逐条引用

**新增：** `lib/ai/business-teardowns.ts`及测试；`lib/domains/business-teardowns/{report,report-validation,consent,ai-research}.ts`及测试；`120_business_teardown_research.sql`。

**修改：** `lib/ai/index.ts`，确有必要时扩 `lib/ai-gateway.ts` 的operation/module枚举，不新建另一套Gemini client。

- [ ] 先写模型边界红测试：只有评价数时，sales、order quantity及buyer proportion保持未知；伪造snapshot ID、篡改quote、引用未选材料和自创真实利润均拒绝。
- [ ] consent保存允许平台、公开字段/摘录范围、逐次或自动用途、版本和撤回时间。服务端检查当前范围与输入清单，旧新闻许可不作替代。
- [ ] generateCaseDraft锁case并冻结本次主/对照snapshot清单、哈希和prompt版本；相同request先查已保存草稿再调用AI，避免失联后重复付费。
- [ ] 客观数值表由代码从QuantityObservation等字段渲染，模型不填写新数值字段。模型解释带refs、竞争解释和区分观察；自由文本仍须校对，schema合格不代表因果已证实。
- [ ] 提示词固定要求：先找不可比和失效条件；无法查明时写未知；来源是资料而不是可执行指令；禁止综合评分和迎合。数字比较/因果缺口不被模型“补齐”。
- [ ] 持久化前再次确认owner、输入版本和授权仍有效；在途许可撤销则不发布输出。失败保留材料页并显示error，不以空报告替代成功。
- [ ] 为本模块调用记录保存owner/case/revision关联；来源或案例内容删除时，经受控gateway路径清理其已保留的请求/输出正文和派生报告，只保留无原文用量回执。清理不能影响其他模块，不能留下可恢复已删摘录的调试副本。将这条删除链纳入真实SQL与日志夹具测试。
- [ ] 用合成来源/mock模型运行 `npx vitest run lib/ai/business-teardowns.test.ts lib/domains/business-teardowns/report-validation.test.ts lib/domains/business-teardowns/consent.test.ts`，确认没有实际Gemini请求。

关键验收输入：

| 输入 | 必须输出/拒绝 |
| --- | --- |
| 包装12枚＋评价数量300 | 订单件数/销量/买家数未知 |
| 某条评价称购买3盒 | 单条样本叙述，不能生成全店均值 |
| 平台显示“1万+”，时段未说明 | 下界、原单位、未知时段，不能称月售10000 |
| 女性20代榜单中出现 | 该榜单观察，不能生成人群占比 |
| 商品1000日元，成本缺失 | 不输出真实利润/净利率 |
| 同类两店不同促销窗口 | 指明不可直接比较，不认定文案造成差额 |
| quote正文为independent | 保持原文字面，不译成枚举标签 |

### B2 分层阅读与完整案例模板

**新增：** `app/(app)/business-lab/{report-view,source-drawer,ai-consent-panel,comparison-panel}.tsx`及测试。

- [ ] 按产品设计第2节的12个section key渲染，摘要只提最关键解释与未知；出处从摘要和正文都可打开。
- [ ] 人群/购买过程以材料支持的情境呈现，不画虚假的人口比例图；经营链每环能展开原文、反例或未知。
- [ ] 竞争解释和失效条件在主阅读路径可见；不将对照店简单命名为失败商家。
- [ ] 改进建议展示目标问题、代价、条件与检验办法，允许“不建议增加东西”。
- [ ] 完整正文只显示经过publishCaseRevision确认的冻结版本；重生成形成新草稿，旧读者不会因后台重跑突然换结论。
- [ ] Chrome夹具验证引用打开、未知可见、来源日期、模型失败、授权撤回、保存成功但刷新失败、移动布局；截图和数据全部合成。

### B3 方法、未知与最小验证桥接

**新增：** `lib/domains/business-teardowns/{lessons,action-bridge}.ts`、`app/(app)/business-lab/{lesson-actions,action-preview-panel}.ts/tsx`及测试。

- [ ] 用户亲自选择方法或反例，并写适用条件；原文与用户解释分开，报告本身不自动进入“学到了”。
- [ ] previewCaseAction重查本人case revision与目标idea；呈现将写入的观察或实验字段、资源约束和仍需真人回答的问题。
- [ ] confirmCaseAction核对preview哈希和owner，使用同事务或可恢复receipt调用既有保存入口，先ack旧请求，不重复创建目标对象。
- [ ] 针对接触不到人的资源分支，只建议公开材料核对/原型交付测试，不能替用户填has_pain/will_pay。
- [ ] SQL和action测试确认阅读、跳过、沉淀、桥接均不写validations或ideas.status/last_activity_at；保留原有锁机制。

**B期完成条件：** 用户手动确认一家店和材料后，可获得一篇完整可追溯拆解，并自选保存一个经营方法或行动。此时尚不声称每天后台自动产生新报告。

## C期：每日自动选题与受控生成

### C1 候选轮换与身份排除

**新增：** `lib/domains/business-teardowns/{selection,rules,rotation}.ts`及测试；`121_business_teardown_jobs.sql`中的选择规则表。

- [ ] 候选须通过资料、身份、未重复、用户排除的二元准入；规则保存行业/价位/经营方式轮换与固定tie-break，不产出机会总分。
- [ ] 商家曾作为主案例即排除，作为对照则可明确复用；同主店不同SKU不放回候选。
- [ ] 候选池保存拉取范围、时间与分页，含非头部入口；缺对照或无量化销量时不伪造字段。
- [ ] 以DB东京日期分配每日case，默认07:00只作为可编辑产品设置；用户未启用timer时首次打开也使用同一分配RPC，不两套选题逻辑。
- [ ] 测试同一队列输入可复现、规则改版不改变昨日案例、空池/超预算只显示未完成、未读/跳过不能让店铺重新入池。

### C2 独立商店任务与自动AI许可

**新增：** `lib/domains/business-teardowns/jobs/{domain,commands,executor,queries}.ts`及测试；`app/api/cron/business-teardowns/route.ts`；对应设置面板。

- [ ] 独立的商店source配置和预算表，不向116/118插入非e-Stat配置。通过窄适配接口共享纯租约/重试思路，不修改统计source allowlist。
- [ ] 每个HTTP/AI请求开始前检查总开关、owner、来源、预算、lease、case revision和当前授权范围。预算分别记录HTTP次数/AI次数与实际gateway用量，未知费用不伪造为0。
- [ ] 准备材料和生成报告分开记账；默认无自动AI许可只准备材料。已有新闻许可、新来源未授权、私人字段出现时都不调用模型。
- [ ] DB claim/reserve/finish防并发与失联，完成回执按实际冻结终态报告；过期worker不能扣第二遍或补写旧输出，未尝试额度规则公开。
- [ ] 页面可停用/退出，停止下一次请求并拒绝在途未获继续授权的输出；失败退避且有上限，原因可见。
- [ ] CRON_SECRET鉴权；不修改现有cron日新闻任务，不自动改vercel.json。独立验收后再由用户决定生产timer启用。
- [ ] SQL注入失败夹具：报告保存失败时发布指针和记账状态不能一半成功；重复完成/响应丢失不得多发一篇或多调用AI。

**C期完成条件：** 有足够合格候选、有效公开材料许可和预算时每天自动形成一个唯一新主案例；其他情况透明显示缺口，可继续看历史和材料。

## D期：多平台、身份修正与后续学习

### D1 小红书资料完善与跨平台身份

**新增：** `lib/domains/business-teardowns/{manual-sources,identity-links}.ts`、`app/(app)/business-lab/{manual-source-panel,identity-link-panel}.tsx`及测试。

- [ ] 支持链接/公开摘录/截图转写文本，来源日期与可见范围必填；截图不默认自动上传Gemini，展示选择范围后才使用选定文本。
- [ ] 需要登录、无法访问或只见部分内容时保留缺口；没有任意店铺订单接口时不标成已接通。
- [ ] 经营主体关系由用户核对材料后确认；同名或模型相似判断只作待核对提示，不自动合并。
- [ ] 两个已发布历史案例后来合并身份时追加重复提示与身份版本，保留两天原报告，未来按合并集合排除；不让唯一索引冲突迫使删除历史。
- [ ] 若新增正式商家授权/付费数据源，必须单独声明覆盖、授权和预算，重新验收采集与自动AI范围；不因本期计划默认开通付费服务。

### D2 条件化方法与案例后续

**新增：** `lib/domains/business-teardowns/{expectations,followups,corrections}.ts`、`app/(app)/business-lab/{followup-panel,lesson-library}.tsx`及测试；`122_business_teardown_followups.sql`。

- [ ] 用户在揭晓新材料前写可核对预期、期限和判据；保存原report revision，不允许回填成更早的预测。
- [ ] 到期补相同口径来源，展示支持/推翻/仍未知和引句；列表没出现、抓取失败不能自动判下架/停业/预测落空。
- [ ] 更正来源后找到显式依赖的案例章节/方法/后续引用，追加复查提示，不静默改旧判断。
- [ ] 方法库按场景、成立条件、失效条件和用户确认内容检索，不按AI机会分排序；周复盘只取用户自己的确认与解释，不把自动报告计作经营能力证明。
- [ ] 旧案例更新独立显示，不占今日新主案例。对照复用明确标“已见案例”，历史可追溯。

**D期完成条件：** 多平台材料的出处和限制可核对，已知主体不重复，旧判断能被新材料纠正，学习记录带条件而不是金句集合。

## 3. 发布与验证清单

拟定开关：`BUSINESS_TEARDOWNS_ENABLED`、`BUSINESS_TEARDOWNS_AI_ENABLED`、`BUSINESS_TEARDOWNS_JOBS_ENABLED`，均默认false。来源级别选择、预算与Gemini许可另存owner配置，开关不代替许可。

- [ ] 各期关键行为先写红测试、运行确认失败，再写实现和复验；不新增只复述实现的低价值测试。
- [ ] 最终运行 `npx vitest run`、`npm run lint`、`npx tsc --noEmit --incremental false`、`npm run build`，检查exit code而非只看终端最后一行。
- [ ] 新增 `scripts/verify-business-teardowns.mjs`，隔离PGlite测试owner、复合引用、幂等、日期、并发、隐私删除和无旧模块副作用。
- [ ] 新增 `scripts/verify-business-teardowns-ui.mjs`，生产build完成后再启动真实React/Chrome夹具；禁止与清理CSS的build并行，覆盖390px、重试身份和保存/刷新区分。
- [ ] 官方接口实机例与合成测试分别记录；缺平台权限时明确未接通，不用mock结果冒充真实采集。
- [ ] 只读schema检查只探测owner读RPC；不使用claim、ingest、purge或generate作探测，避免检查产生写入/费用。
- [ ] 独立规格及质量复核；对原文翻译、销量单位错配、授权继承、主案例重复、预算失联和历史覆写逐项给出验证证据。
- [ ] 每期交付文档写清迁移、开关、实际API能力、AI许可和真实账号验收待办；不得将已有其他阶段大批未提交代码一起自动提交。

## 4. 本轮产出与后续顺序

本轮只写产品规格和分期计划，未修改产品代码、执行迁移、连接商家接口、调用Gemini或开启cron。建议按A→B→C→D实施，首个产品验收点是B期末的可核对完整案例，自动每日体验以C期验收为准。
