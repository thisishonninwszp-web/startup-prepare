# 解释对照与退出教材：发布验收

日期：2026-11-24（日本时间）。应用提交：`e4f3e64fbf1037b3003ade7cd2a74b75c3f90fd7`。

## 功能范围

- 保存报告或官方退出教材中的两种解释，亲手填写两种预测、未控制因素、反证条件、调查方法和期限。后续结果按当时的准确版本对照，复用确认历史和本人方法。
- 官方退出／收缩教材区分事件事实、公司说法、本人假设及未知；同一主体不重复选出，每天日本日期最多一份。没有亲自确认的候选时保留空白。
- 新增收集代码已接入现有 GitHub 调度，但全局开关与独立账号许可保持关闭。确认队列的日次选出不调用外部服务。额外预算为每日最多2次搜索／3次实际网页请求（含跳转）／1次 Gemini，不沿用楽天许可。
- 只增加生意拆解内部入口，没有新增一级导航、想法评分或真实需求验证记录。

## 检查证据

- 完整 Vitest：422个文件、2641项测试全部通过。
- `npx tsc --noEmit --incremental false --pretty false`、`npm run lint`通过。
- 实际 SQL：146基础、147/148/150混合生命周期、148官方出处、原124研究、149收集及149擦除场景均通过；独立审查另运行旧123任务回归。
- 两轮独立规格与质量审查完成。修正了重复主体截断后续候选、保存应答丢失后产生新请求、来源删除后工作台遗漏本人记录、诊断原文未同步擦除、选出教材仍可编辑等问题，并验证了对应回归。
- 实际 React 浏览器验收：报告→计划→结果，教材→研究，原请求重试只保存一条，删除后隐藏旧原文，已选教材不可编辑，391px无横向溢出。使用合成动作，没有向生产写入演示内容或调用提供商。
- PGlite验证串行事务与锁定路径，没有模拟真实多连接争用；不将其宣称为并发实测。

## 生产数据库

五份迁移已按顺序应用，`schema.sql`逐字追加：

|迁移|生产版本|本地与生产一致的MD5（LF、trim）|
|---|---|---|
|146|20261123161211|378c0d646a17bbcf65dc86ad19f329fb|
|147|20261123161219|8e7df345322826a7c2b50bf1416f0b08|
|148|20261123161237|a9c048871bd36403060b5af6b53f83cb|
|149|20261123161243|098ec803e7a605d0756c19a1fccc4589|
|150|20261123161252|a4f0cbd8a5732ef6acae496a0db688e2|

- 十张新私表启用RLS，anon/authenticated/service_role均无直接SELECT；仅预期的新RPC向service_role开放，内部helper不开放EXECUTE，search_path固定。
- 安全advisor没有新增WARN/ERROR。十项新增INFO是有意封闭的私表RLS无公开策略，详见[Supabase说明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。既有19项search_path、5项anon definer、12项authenticated definer、1项密码保护提醒保持原样。
- 18项生产SDK只读探针通过：新查询及旧计划／结果／后续计划／历史／方法／研究／工作台；匿名、空owner和内部helper调用均拒绝（42501）。未调用会初始化默认行的collection state命令作为只读探针。
- 迁移后额外收集已启用账号数为0。没有开启环境变量或发送任何新增搜索、网页采集、AI请求。

## 应用部署

精确应用提交的Production部署 `8004333835` 已成功，完成时间2026-11-24 01:19 JST。部署地址：https://startup-prepare-qos8qews4-forcus-wu-s-projects.vercel.app 。正式域名：https://startup-prepare.vercel.app 。

登录后实际检查通过：

- 已发布报告版本3，展开章节后能通过准确reportId/revision/section/index/manifestHash进入解释对照；A/B来源正确，自己填写的预测表单为空，没有自动填答案或保存演示计划。
- `/business-lab/withdrawals`正常显示没有确认教材；没有虚构教学内容。
- `/business-lab/withdrawals/collection`仅主账号可见，明确显示部署开关关闭、账号许可未勾选、执行按钮禁用；没有执行采集或修改许可。页面读取按设计初始化了一行关闭的默认设置。
-391px手机布局：scrollWidth=clientWidth=376，控制台error/warn为空；临时viewport已重置，本地合成服务器已停止。
- 新cron匿名请求实际返回401。带生产secret的一次性任务试跑被自动审批拒绝，因为可能新增或选出今日教材，未执行也未绕过。GitHub触发接线及默认关闭路径已通过单元测试；不宣称已实际跑过授权生产cron。
- 最终数据库只读核对：1行关闭设置，0启用账号、0收集任务、0请求票据、0退出教材。

生产截图（本地验收产物）：`.tmp/explanations-withdrawals/production-explanations.jpg`、`production-withdrawals.jpg`、`production-collection-off.jpg`、`production-collection-mobile.jpg`。发布后的证据文档提交单独保存在功能分支，应用与main保持上述已验证提交。


## 授权后补充的单次任务试跑（2026-11-24 JST）

用户在询问是否补做生产日次任务后回复「继续」，确认本次单次操作。先前的自动审批拒绝已记录为历史，本次已完成实际试跑。

- 本地现存CRON_SECRET请求返回401，任务未执行。自动审批拒绝从Vercel提取生产密钥，因此没有读取或导出密钥，也没有修改生产配置。
- 改用仓库现有Secret在隔离分支 `codex/withdrawal-cron-smoke` 上执行单次临时workflow。临时版本只有一次新退出教材接口请求，无重试、无定时触发、无楽天或其他任务，且必须断言collection为disabled。yaml解析与这些范围约束检查通过。
- [实际试跑45382302564](https://github.com/thisishonninwszp-web/startup-prepare/actions/runs/45382302564)成功；执行时间2026-11-24 20:14 JST。唯一业务步骤 `Trial withdrawal selection only` 成功，HTTP200，响应 `{"selection":{"id":null,"caseId":null,"revision":null},"collection":{"status":"disabled"}}`。
- 前后数据库核对：选出回执2→3；教材0→0、采集任务0→0、请求票据0→0、启用账号0→0。确认队列为空，正确保留空教材，未调用新增搜索／网页／AI。
- 临时试跑配置未合入main；已切回原功能分支，原定时任务配置恢复。生产应用提交与付费采集配置保持原样。
