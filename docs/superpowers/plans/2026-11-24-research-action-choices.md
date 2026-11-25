# Research Action Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有三类确认计划中保存逐版的行动分支，让调查结果与当时的选择对照，不替本人决策或把计划当成执行。

**Architecture:** 复用137/139/141/143/147的计划、版本、结果和历史。在私有扩展表保存逐版行动约定及独立结果对照，统一DTO和共享表单；来源与想法标题实时读取。旧记录没有扩展时保持旧DTO，命令、约定和回执原子保存。

**Tech Stack:** Existing Next14 App Router / TypeScript / Tailwind / shadcn / Supabase RPC / Vitest / PGlite. No new libraries, provider calls, collection flags, reminders or first-level navigation.

---

## 执行基线与规则

- 用户已确认具体设计：`docs/superpowers/specs/2026-11-24-research-action-choices-design.md`，并要求继续。直接执行计划，无需再问执行方式或重复批准功能。
- 复用当前linked worktree，分支codex/research-action-choices。已fetch并合并origin/main的顾客页面改进，远程基线8fc69c2；无迁移151冲突。再次发布前复核。
- 任务1用一位实现代理；完成规格审查后再质量审查。任务2换新代理；root可在文件边界清晰时负责独立的任务3。root统一提交/schema/生产，不让代理调用provider、生产库或git。
- `.tmp/action-choices`仅本地验收，不入git。已有`.tmp`合成页面与用户localhost4333不改动。基线全量测试输出到`.tmp/action-choices/baseline-vitest.log`。
- 按现有编号式迁移约定新增151，最终逐字追加schema.sql。用户的既有发布授权有效，新增付费收集持续OFF；不试跑其他任务。

## 公共契约（各任务使用同一字段）

新增 `lib/domains/business-teardowns/action-choices/domain.ts`：

```ts
type ActionTarget='current'|'alternative'|'hold';
type ActionConditions={kind:'expectations'}|{kind:'explicit';a:string;b:string};
type ActionChoiceInput={
 decision:string;currentAction:string;alternativeAction:string;holdAction:string;
 conditions:ActionConditions;
 mapping:{a:ActionTarget;b:ActionTarget;unclear:ActionTarget};
 relatedIdeaId:string|null;
};
type ActionChoiceView={
 choice:ActionChoiceInput;conditionA:string;conditionB:string;
 ideaAvailable:boolean;ideaTitle:string|null;
};
type ActionReview={
 outcome:'a'|'b'|'both'|'neither'|'unclear';
 nextAction:ActionTarget|'other';otherAction:string|null;reason:string;
 execution:{what:string;actedOn:string}|null;
};
type ActionChoiceIdeas={available:boolean;items:{id:string;title:string}[];nextCursor:string|null};
```

- Trim/nonempty UTF16 limits: decision1000, currentAction/alternativeAction/holdAction/otherAction2000, explicit a/b3000, reason/execution.what3000. Strict keys, valid UUID, real cashDate1900..2200; execution.actedOn不能晚于Tokyo today，DB最终校验。execution完整对象或null，otherAction非空 iff nextAction=other。
- `actionChoiceInputSchema`, `actionChoiceViewSchema`, `actionReviewSchema`, `ActionChoiceInput/View/Review`统一出口。共用 `sameActionForKnownOutcomes(choice)`只比较mapping.a/b，`expectedAction(choice,outcome)`把both/neither/unclear映射到unclear，不判断因果。
- 模拟/后续/解释save顶层 `actionChoice?:ActionChoiceInput|null`。新UI显式对象或null。省略仅兼容创建或当前无约定的旧计划；当前有约定而省略则报明确错误，不悄悄复制。erase不接收该字段。
- 旧库兼容澄清：只有确认缺少151对应RPC，且当前、历史载入及本人输入均无约定时，新UI才省略该字段以使用旧保存流程。已有或已填约定、非预期读取错误都不能降级、丢弃或静默提交null。
- 解释origin必须conditions.kind=expectations，实时projection读取精确版的本人expectedA/B；其他origin必须explicit。不得保存报告AI解释为本人观察条件。
- DTO按有内容时增加 `actionChoice?:ActionChoiceView`：三个计划record、ResultPlan/Version/Record、ConfirmationNode。结果record/node另外可有 `actionReview?:ActionReview`，即使plan删除也保留本人独立review；actionChoice则随plan版本擦除。无内容继续省略，不能加null破坏原strict shape。
- result append顶层 `actionReview?:ActionReview`，省略合法；存在时必须有该owner/result所选planRevision的约定。命令总体JSON UTF8上限160000；旧主体字段仍保留原限额。
- 新读RPC `business_action_choice_context(owner,operation,input)`只支持ideas，20项date/uuid keyset页。transport `loadActionChoiceIdeas(owner,{before?}={})`严格解析、校验分页/重复，只有missing151返回available:false。linked idea本身由choiceView实时返回标题，即使不在首20项也能显示；删除目标后标题不可恢复。

### Task1: Domain, atomic SQL and shared DTO integration

**Create:** `lib/domains/business-teardowns/action-choices/{domain.ts,domain.test.ts,transport.ts,transport.test.ts,postgres.integration.mjs,HANDOFF.md}`；`supabase/migrations/151_business_research_action_choices.sql`。

**Modify:** `lib/domains/business-teardowns/{reality-checks,followup-checks,explanations,reality-results,history}/{domain.ts,transport.ts}`及对应测试。必要时只改已有SQL测试fixture的组合载入，不修改历史迁移。此任务不改app/schema/git。

- [x] 先写并观察domain RED，再实现契约与纯helper。例如：

```ts
expect(actionChoiceInputSchema.safeParse({...choice,decision:' '}).success).toBe(false);
expect(actionReviewSchema.safeParse({...review,nextAction:'other',otherAction:null}).success).toBe(false);
expect(sameActionForKnownOutcomes({...choice,mapping:{a:'hold',b:'hold',unclear:'current'}})).toBe(true);
expect(expectedAction(choice,'both')).toBe(choice.mapping.unclear);
```

- [x] `npx vitest run lib/domains/business-teardowns/action-choices`确认正确RED；实现strict schema、字符串边界、source kind约束、非评分提示范围；跑GREEN。
- [x] 从withdrawals基础SQL harness载入真实119–150（147–150显式按序追加），先执行未有151时的RED。fixture有两个auth owner和最低可用ideas表，三个origin分别用真实命令创建，不用伪造假origin。
- [x] 151新增 `business_reality_action_choices` FK(user_id,plan_id,revision)→真实139版本，`business_reality_result_actions` owner/result关联；RLS、零直接grant、固定path、private helper撤EXECUTE。不添加想法状态或新表级API公开权限。
- [x] 原子扩展三个save与result append/erase，保持137 owner锁和既有回执语义。扩展回执必须绑定完整input，legacy回执原样可重放；任何约定/review校验失败或回执写失败都回滚主体写入。未知ack不产生新requestId。
- [x] 补齐现行DTO与143历史投影的optional字段。计划历史/current/result-plan/result-version/result-record分别取精确revision。不能从较新版重建旧版约定；解释expectations与choice同事务同版，原来源过滤不变。
- [x] 实际SQL断言：v1约定→result(v1)→plan(v2约定改变)→result仍v1；显式null创建v3无约定但v1仍在；省略更新有约定报错；其他owner/错误version/foreign idea拒绝；source丢失保留本人约定，idea丢失无旧标题；erase plan清所有choice和结果投影，独立review保留；erase result删除review；receipt重放不恢复擦除正文。
- [x] 新context RPC只读ideas，owner/service/strict cursor与20+同时间分页；source metadata不进回执；source/目标内容读失败不能当不存在的成功。
- [x] scoped domain/transport + actualSQL；root安排规格审查、修正，再质量审查。稳定契约写HANDOFF，列出任何出于真实代码限制的调整，再交任务2。

运行：`node lib/domains/business-teardowns/action-choices/postgres.integration.mjs C:/Users/pc/.codex/visualizations/2026/10/25/01a17228-5263-75d0-96db-ac39e7f31278/event-db-test/node_modules/@electric-sql/pglite/dist/index.js`。期望明确打印三个origin/oldDTO/exact versions/erase/ACL/rollback passed；不宣称真实多连接并发实测。

### Task2: Shared optional fields and three plan editors

**Create:** `app/(app)/business-lab/action-choices/{actions.ts,actions.test.ts,action-choice-fields.tsx,action-choice-fields.test.tsx,use-action-choice-ideas.ts}`。

**Modify:** explanation `use-explanation-plans.ts`,`explanation-plans-panel.tsx`,`explanation-views.tsx`；simulation/checks `reality-checks-panel.tsx`,`reality-checks-views.tsx`；simulation/checks/next `followup-checks-panel.tsx`,`followup-checks-views.tsx`；三处page/actions仅在所需metadata/初始化上修改。各workflow/panel测试。不要改任务3结果/history文件或domain/SQL/schema。

- [x] RED共享fields：disabled/optional closed没有新增必填；启用显示本人空字段；expectations模式不重复输入A/B；explicit模式显示观察条件；相同行动提示仅a/b、不阻止保存；hold语义具体。使用受控字段，null明确关闭。
- [x] 实现共享fields，传value/onChange/conditionsMode/currentExpectations/disabled，不在组件内保存业务记录。只读idea-picker actions由session解owner，owner不能来自input；20项分页、exact linked option、focus清旧title并代次隔离，失败隐藏旧候选，不恢复被删标题。
- [x] 三个编辑器状态、预览和pending保存均纳入choice。新save总传对象/null，保存记录重开用`record.actionChoice?.choice??null`；expectedA/B变更要清preview，分支预览展示当版本人预期。

```ts
const pendingFirst=save.mock.calls[0][0];
focus(); await settleReads();
await retryOriginal();
expect(save.mock.calls[1][0]).toEqual(pendingFirst);
expect(save.mock.calls[1][0].actionChoice.mapping).toEqual(pendingFirst.actionChoice.mapping);
```

- [x] RED→GREEN三个origin工作流：新开/reset空块；dirty刷新保留本人输入；切record必须fresh revalidate，旧source/title不恢复；冲突不自动合并；pending锁定块和record切换；修改choice/expectedA/B清预览；未知回执原body重试。
- [x] 缺151仅新块标“行动约定尚未就绪”，旧阅读/编辑可用；检测已有choice却metadata读取失败时不可假装旧版无choice并保存。后补约定只通过正常新计划revision，不重写旧结果。
- [x] scope Vitest+TS/lint，规格审查后质量审查；修正闭环，交root结果/历史整体验收。

### Task3: Result and history comparison (root, disjoint from Task2)

**Create:** `app/(app)/business-lab/action-choices/{action-choice-view.tsx,action-review-fields.tsx,action-review-view.tsx,action-review.test.tsx}`。

**Modify:** `simulation/checks/results/{use-reality-results.ts,reality-results-panel.tsx,reality-results-views.tsx}`及workflow/view tests；`history/confirmation-history-view.tsx`及tests。不改Task2计划编辑器。

- [x] RED snapshot视图：展示选定版decision/conditions/mapping，latest plan不同不覆盖；plan删除显示原约定擦除，独立review只显示本人理由/实际执行，不恢复旧行动正文/关联idea标题。
- [x] 结果独立可选review，fields outcome/nextAction/otherAction/reason/执行记录；execution何事+日期共同填或共同留空，最大日期Tokyo today。明确“准备采用”与“本人记录已执行”。未知/同时/都不符合允许，expected mapping只是参照，不自动选赢家。
- [x] preview展示原版约定+本人review，任何改动使确认失效；保存完整review到result append同事务；没填写不伪造。changed chosen action与原分支不同允许，并列显示，不写评分。

```ts
expect(renderSnapshot(version1,version2)).toContain(version1.actionChoice.choice.currentAction);
expect(renderReview({...review,execution:null})).toContain('尚未记录实际执行');
expect(renderReview(review)).not.toContain('真实需求已验证');
```

- [x] useRealityResults：review参与dirty、新draft/reset、选plan/version、acklost pin、focus、preview；未知写不能切到较新planRevision；erase清独立review视图和缓存，不让stale read恢复。
- [x] 确认历史原节点追加可选ChoiceView/ReviewView；解释/模拟/后续父节点、exact links、pagination和原TimingNote照常。workspace仍用既有种类，不额外复制choice prose到新缓存。
- [x] scoped Vitest与真实SQL混合回归；独立规格后质量审查。

### Task4: Actual browser lifecycle and final review

**Files:** `.tmp/action-choices/{build.mjs,fixture.ts,entry.tsx,serve.mjs}`仅本地；`docs/superpowers/plans/2026-11-24-research-action-choices.md`追踪证据。

- [x] 用真实共享Fields、三类PlanPanel和Results/History组件，合成actions内存存储/回执，无生产或provider。创建独立fixture端口，不影响用户4333。
- [x] 浏览器完成：可选块默认关闭→本人填写→同分支提示→改分支→预览保存v1→结果比较→改planv2→结果仍v1→未知/不同动作/未执行；另测acklost+focus原body重试、idea/source/plan/result擦除与旧内容隐藏。
- [x] 桌面/391px无横向溢出、长文本/console、重置viewport/关闭临时tab；保存截图。按CUA协议在完成后发browser-complete标记。停止fixture后再考虑本地build，生产构建单独验证。
- [x] 新鲜最终整体验收：规格映射、legacy DTO/no source leakage、原四项计划条件和历史，owner/FK/擦除与副作用；修正所有material findings并重跑对应回归。
- [x] `npm test`、`npx tsc --noEmit --incremental false --pretty false`、`npm run lint`、actual151SQL及原147/139/141/143混合脚本全部通过。不修改无关顾客页面。

### Task5: Production migration and release

- [x] fetch main并保留他人提交，再核对151编号。schema.sql逐字追加最终151。收集生产最新migration/catalog和security advisor baseline，检查后通过apply_migration一次应用；连接器确认过期最多重试一次，再转既有授权安全路径，不用execute_sql绕DDL。
- [x] 只读production probes验证版本、tableACL/RLS/private helpers/only intended RPC、匿名/nullowner拒绝、旧plan/result/history等原接口和missing IDs。不创建个人演示记录、不跑定时任务或provider。
- [ ] commit仅本轮明确文件，排除.tmp，推送功能分支和main无force；确认精确应用commit对应Production Vercel成功，不混用Preview状态。
- [ ] 登录后的正式域名检查现有记录/空态、可选块、旧表单、结果/历史和截图；不保存验收计划。新收集flags仍OFF。停止临时server，更新本计划和验收文档。发布后纯证据doc可单独保留功能分支，避免无意义重复生产部署。

## 计划自检

已覆盖具体设计的三个origin、optional字段、mapping范围、本人条件、linked idea、逐版/事后补录、未知/未执行、full-body retry、source/plan/result删除、旧DTO/旧client写保护、服务权限和发布边界。以上类型和字段为公共契约，代理不得单方面改名；必要调整先反馈root并同步本计划。无新AI/付费任务/锁定/评分/想法状态副作用。


## Implementation evidence (2026-11-24 JST)

- Latestmain8fc69c2 customer updates merged without conflict; baseline423files2649tests passed. Existing linkedworktree reused.
- Task1 domain/contracts,151SQL and all DTOs are stable;15targetedfiles68tests, actual151 and all4old139/141/143/147assertion suites pass. Original pre151-generated receipts replay after151. SPEC finding explanation allowing explicitconditions fixed TS+SQL. Rootfound nullable ideas.title; newSQLfixture reproducednull→emptystring mismatch and now passes withowneduntitledideaavailable. Fresh qualityreview in progress.
- RootTask3 shared views/results/history done. Independent sequential SPEC+quality clear:11files81tests and8implementationfilelint passed. Source choice/title only shown afterfresh exactversionverification; independent review survives planerase; source readfailure hidesoldmetadata; changed review body cannot be adopted afterack; full pendingrequest includesreview. Reviewoutcome/nextAction startblank, actualexecution optionalanddatebounded.
- Integratedcurrentfullsuite428files2684tests passed, incremental-disabled TypeScript and ESLint passed. Source/UI/scripts still uncommitted pending Task1quality and Task2planeditors. Localbrowserfixture prepared under.tmp/action-choices, bundlebuild succeeds; no server started or actualbrowser acceptance yet.

- Task1 independentqualityclear:68tests+actual151+fourunchangedlegacySQL suites independently rerunPASS; no remainingmaterialfindings. Rootactual151 andlegacy scripts alsoPASS. Task1 androotTask3ready, Task2begins next.

## 收尾记录（2026-11-26，东京）

- 延续已批准范围；已fetch，origin/main无新增未合入提交，迁移编号仍到150，151未在生产执行。生产security advisor基线：INFO无policy134项；WARN固定search_path19、anon definer5、authenticated definer12、密码泄露检查1。
- 三类真实计划组件在本地合成actions中完成保存；解释计划A/B来自本人正在编辑的条件。修改预期使预览失效；丢失ack后focus再重试只产生一份计划；v2修改后，结果及履历仍展示v1的原条件/行动。材料不足、另选行动和未执行文案均实测。
- 391px长文本编辑无横向溢出（clientWidth=scrollWidth=376）；focus保留400字本人输入；删除关联想法后旧标题隐藏。控制台无error/warn。截图位于本地.tmp/action-choices，未写入生产记录、未调用provider。来源擦除后的异步完成状态待最后补验。
- 新鲜真实151SQL与四套未改断言的139/141/143/147兼容SQL均PASS。schema.sql已逐字追加151。计划编辑器独立规格审查发现并发focus与候选标题缓存的过时响应风险，正在回归修正，尚未发布。
- 上述元数据问题已修复并经独立规格复审：旧focus响应不能恢复删除标题；精确计划读的不可用元数据覆盖候选缓存，并跨reset/切换保留。最终质量审查另发现模拟计划精确get-null后保留未修改旧约定，已用清除未修改缓存与ID墓碑修复；真正未保存输入保持冲突、不可继续保存，错误读取及其他记录缺失不会误清。规格增量审查与质量复审均clear，最终相关35测试PASS。
- 最终全项目431文件、2722测试PASS；非增量TypeScript与全项目ESLint通过。默认本地Next构建遇Windows跨盘node_modules联接解析错误，已定位，正在保留符号链接路径重跑构建。
- 最后来源擦除浏览器补验：并发focus/props更新先隐藏派生内容，按页面提示重新读取后，未保存本人选择完整保留，来源原文仍隐藏；控制台error/warn为空。截图source-recovery-final.jpg；本地fixture服务器已停止。
- 生产151已通过apply_migration执行（首次确认过期，按连接器提示重试一次成功），版本20261125154633，完整SQL的raw MD5为ea4a86f472e660f1520cba4722b8db93，与本地文件一致。2表RLS开启，anon/authenticated/service_role均无直接SELECT；6个helper均不对API角色开放，唯一context RPC仅service_role可执行，全部固定search_path。12项真实transport/匿名/nullowner/helper/直接表读取探针PASS，无写入或provider调用。security advisor仅INFO无policy134→136（两张有意私表），WARN计数未变。应用代码待部署。
- 保留符号链接路径的本地构建仍受C/D跨盘共用模块影响，产生mini-css-extract-plugin身份不一致；不为验收环境修改产品配置。改为先推功能分支，在Vercel正常检出环境验证Preview构建，成功后再发布main，并以精确提交的Production成功为最终构建证据。
