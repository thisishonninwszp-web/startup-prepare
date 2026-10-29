# P6 统计分母、原型事件与长期运行实施计划

> **For agentic workers:** 使用 subagent-driven-development 分块实现116统计、117产品事件、118调度，root负责集成/独立复核/浏览器与交付。沿用当前功能分支和未提交依赖；不提交、不部署、不执行远端迁移、不启用真实原型采集或生产调度。

**Goal:** 用一个实际核验的政府统计表补足市场分母，准备告知后才启用的原型行为接入，并让经确认来源能够在明确预算内重试、停用和删除。

**Architecture:** 三个独立owner隔离模块，服务端调用统一使用Supabase。116保存固定e-Stat表的元数据、筛选条件、原始结果与修订、预览确认和比较边界；117保存原型/告知版本、严格事件白名单、请求身份、显式想法关联及删除占位；118保存经批准来源配置、预算预留/租约/尝试日志和停用状态，执行器只调用固定e-Stat适配器。默认开关关闭，不修改旧模块的验证/想法状态/计时或锁机制。

**Tech Stack:** Next14、TypeScript、Supabase PostgreSQL、Tailwind/shadcn、现有ConnectedForm、Vitest/PGlite/Chrome。

## A 统计分母（116）

- [x] `lib/domains/observations/statistics/` 的domain/provider/commands/queries及测试、`116_statistical_denominators.sql`、workbench/statistics-actions和statistics-panel。
- [x] 仅支持官方核验的2021经济普查表 `0004006264`，保留官方metadata、分类code/label、单位、时间地域、更新时间及实际分页范围；不猜行业code、不把企业数/事业所数混用。
- [x] 使用现有ESTAT_APP_ID，仅固定HTTPS官方host、无重定向、超时和响应大小上限。无凭证/表不可用明确失败，不用demo token。
- [x] 用户先选择metadata中实际存在的完整维度、预览样本、范围和可比性，再确认保存/批准持续配置。默认不汇总重叠分类；零、秘匿、缺失和错误分开。
- [x] 原始结果与修订不可覆盖，来源metadata变化时提示重新确认；统计分母不能证明痛点或支付意愿。手动连接本人想法时记录适用范围/未知，不新增validation。
- [x] 至少实际核验一例统计单元，真实请求只读且不把凭证输出/存入原文。人工导入只能明确标manual且结构一致，不能冒充live。

## B 真实原型事件（117）

- [x] `lib/domains/observations/product-events/` 领域/鉴权/命令/查询、`117_product_events.sql`、workbench/product-event-actions/panel和server-to-server入口。
- [x] 原型存在性、HTTPS地址、告知地址与版本、采集事件定义由用户明确确认；先默认停用，激活再接入。尚无真实原型时仅交付接入代码，不代建实际采集项目。
- [x] 允许query/no_result/task_completed/return_visit/inquiry/payment的白名单计数/属性，拒绝原始搜索词、邮件、姓名/IP及任意自由JSON。事件时间与收录时间分开，身份仅匿名标识；不采集浏览器设备指纹。
- [x] 服务端派生owner，令牌只存hash并可撤销/轮换，限流/单次大小有上限，外部事件ID幂等冲突拒绝；未激活/告知不匹配/撤销后拒绝。
- [x] 反馈关联本人想法必须用户确认范围与未知，不将点击/单次付款写成真实验证或长期成立；源事件被删除后引用显示已删除占位，不能保留私人payload副本。
- [x] 用户停用与删除能撤销接入、清除授权事件内容/标识并保留无个人内容的删除回执；明确保留策略。没有向真实原型发送代码或启用采集。

## C 可停用的预算调度（118）

- [x] `lib/domains/observations/scheduling/` 领域/命令/查询/执行器、`118_observation_scheduling.sql`、workbench调度actions/panel和cron入口。
- [x] 只接受116当前批准的不可变e-Stat配置；用户先样本预览与口径确认，再选择周期和日请求预算。无凭证、配置失效或未授权明确不可用，不运行其他旧RSS/AI/外部来源。
- [x] 事务内claim预算预留与租约，重复worker不重复运行/记账；网络尝试消耗请求额度，租约超时保守计费，不释放已尝试请求。失败指数退避、有最大尝试与可见健康/错误，不当作零需求。
- [x] 停用后不能claim或开始新网络请求；已在途请求完成必须复核授权才保存，停用/删除后的结果丢弃。预算用整数请求次数，e-Stat费用不伪造为其他服务的零费用。
- [x] 每次来源网络请求均由执行器在请求前再次校验lease/授权并扣预留预算；过期worker不能写回。周期/预算可修订，旧运行日志保留。
- [x] cron路由CRON_SECRET鉴权+SCHEDULED_OBSERVATIONS_ENABLED总开关；不自动改vercel.json开启生产定时器。可手动运行同一执行器做验收，未配置实际timer明确不等于持续运行。

## D UI与验证

- [x] 工作台内嵌三个面板，各自默认关闭；STATISTICAL_DENOMINATORS_ENABLED / PRODUCT_EVENTS_ENABLED / SCHEDULED_OBSERVATIONS_ENABLED。依赖未就绪时保留旧页面并明确不可用。
- [x] 失败保留输入/请求身份、版本变更纳入operation、保存成功与刷新失败区分、切换context不回填旧数据。隐私删除后派生引用显示占位。
- [x] TDD先失败再实现。独立和联合真实SQL覆盖owner/RLS、重复/并发、过期lease、budget上限、停用/删除、来源失效、无validation/status/activity副作用。
- [x] 真实React浏览器夹具+官方只读e-Stat实机例分别标明，不使用真实原型事件；全量Vitest/lint/TypeScript/build；独立规格与质量复核。
- [x] 交付列出116→117→118迁移、开关、外部集成/采集/生产timer仍未启用的待办。不声称真实原型或生产后台已运行。

本地交付完成，见[实际范围、验证与上线待办](2026-10-28-longitudinal-data-delivery.md)。尚未执行远端迁移、真实原型接入或生产timer启用。
