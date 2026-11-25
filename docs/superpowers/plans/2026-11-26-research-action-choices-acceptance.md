# 调查与行动选择验收（2026-11-26，东京）

本轮按已批准设计，将“调查结果会改变哪个行动”接入解释比较、模拟后的确认计划、调查后的下一份计划。可选填写，不增加旧流程必填项。结果及确认履历读取精确计划版本；准备行动与实际执行分开记录，不自动写入真实接触、Go/Kill或想法活动时间。

## 实现与复审

- 核心/SQL及结果/历史分别通过独立规格、质量审查。三类编辑器最终也通过规格及质量复审，无剩余实质问题。
- 复审修复：解释起点必须引用本人同版A/B；nullable想法标题正确保留可用性；并发focus、候选缓存与reset/adopt不能恢复删除标题；精确get-null清除模拟计划未修改的旧约定，墓碑阻止迟到响应恢复。真正未保存输入保持冲突且不能继续保存，错误读取及其他记录缺失不会误清。
- 旧库兼容仅在确认缺151且无已保存或已填约定时省略扩展字段；其余错误不静默丢弃约定。原请求重试包含完整选择与分支。

## 自动验证

- 全项目 **431文件 / 2722测试通过**。
- 非增量TypeScript通过；全项目ESLint无警告或错误。
- 真实119–151 SQL覆盖三个起点、逐版/null/省略、结果与历史、owner/想法校验、回执/回滚/擦除、分页/ACL及无validation/activity副作用。原139/141/143/147四套断言在最终schema下全部通过。
- Windows默认Next构建因跨盘node_modules联接失败；保留链接路径仍有模块身份冲突。未为本地环境修改产品配置。Vercel正常检出环境的精确提交 **d00de87842ae0935ae5d0b6f848938d0ff677f55** Preview已显示Ready，预览地址 https://startup-prepare-hbxzmfncz-forcus-wu-s-projects.vercel.app 。

## 实际浏览器

使用真实React组件及本地合成actions，未写入生产演示记录：三类计划创建/预览/保存；解释预期修改使预览失效；相同A/B行动仅提醒；丢失ack→focus→原请求重试只产生一份计划；v2修改后结果与历史仍显示v1条件/约定；允许材料不足和另选行动，未记录执行不算已完成。

391px长文本编辑无横向溢出，focus保留400字独立输入。关联想法删除后旧标题隐藏；来源擦除后按提示重新读取，未保存本人选择完整保留、来源原文仍隐藏；结果/计划擦除保留独立结果理由，不恢复原约定。控制台error/warn为空；viewport已重置，本地fixture服务器已停止。截图保存在.tmp/action-choices（不提交）。

## 生产数据库

迁移151通过apply_migration执行，版本 **20261125154633**。完整SQL raw MD5 **ea4a86f472e660f1520cba4722b8db93** 与本地相同，schema.sql尾部与151逐字一致。首次连接器确认过期，按工具提示重试一次成功。

两张表RLS开启，anon/authenticated/service_role无直接SELECT；6个helper均不对API角色开放，唯一context读RPC仅service_role可执行，全部固定search_path。12项真实transport/匿名/nullowner/helper/直接表读取只读探针通过，无写入、provider调用或新采集许可。

security advisor：INFO无policy134→136，对应两张有意私表；既有WARN计数保持19/5/12/1，无新增WARN。

## 发布

功能分支已推送；PR https://github.com/thisishonninwszp-web/startup-prepare/pull/12 在main快进后已自动标记MERGED。GitHub未及时显示Vercel部署状态，因此直接通过已登录Vercel面板确认Preview的Ready及精确提交后，才将main从8fc69c2快进到d00de87。

精确应用提交d00de87842ae0935ae5d0b6f848938d0ff677f55的Production部署 **R7VQoe8CkrbDcnietrVSWMHxjKLo** 已显示Ready，完成时间 **2026-11-26 01:01:11 JST**，构建1分54秒；环境Production、分支main、提交三者在同一部署卡片核对。部署地址 https://startup-prepare-44w4yh1si-forcus-wu-s-projects.vercel.app ，正式域名 https://startup-prepare.vercel.app 。

登录后的正式域名验收通过：

- 解释比较可选区块默认关闭，展开后本人文本为空、三分支未预选，观察A/B直接引用上方本人预期；本人想法picker通过真实只读RPC加载，无缺迁移/权限错误。
- 模拟与后续计划的同一区块可展开，显示明确观察条件A/B；没有保存来源时原保存按钮保持禁用，不伪造记录。
- 原调查结果页和确认履历空态正常；没有从新版计划补造旧记录或行动对照。
- 391px稳定布局的clientWidth=scrollWidth=376，无横向溢出；控制台error/warn为空。临时viewport已恢复，创建的验收页已关闭。未输入个人验收正文或保存演示计划。
- 截图：.tmp/action-choices/production-action-choices.jpg（完整页）、production-action-choices-detail.jpg（行动区块）、production-action-choices-mobile.jpg（391px）；这些本地验收产物不提交。

本次没有新增AI请求、采集任务、自动化许可或生产演示记录。发布后的本文件和计划状态属于纯验收证据，单独保留功能分支，不触发重复Production发布。
