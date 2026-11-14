# signals-jobs 每日生意材料保存失败

## 已查到的证据

- 2026-11-14 Actions 43547224133（main 93f604f）失败于每日生意准备：`automatic material must be official public scalar fields`。随后外部信号步骤均成功。
- 生产只读记录：run ae53c103-8f74-4179-ba62-431da9ad01e5，candymagic:10000575，1 次 inspect HTTP completed，0 次 AI，report not_started。
- JS 已过滤为官方标量且保留所选商品 itemId，SQL 121 仍对整个 merchant JSON 做相等检查。检查候选与 fresh merchant 的显示属性不一致会触发同一个泛化错误；固定店铺/商品身份不应随可变显示属性被拒绝。现有日志没有保留 fresh merchant 的具体差异，不声称已确认到底是名称还是 URL 字段。
- 2026-11-13 run 43354534401 是另一原因：byurjapan:10000196 未能从官方来源取得，3 次 HTTP failed，0 AI。不会把外部缺失伪装成成功，或替换已经固定的当天主店。

## 修复范围

- [x] 先以“店名变化但身份相同”的合成回归重现 SQL 相等约束失败；同时覆盖错误商店、商品、URL、身份范围。
- [x] 在执行器保存前核对固定平台/店铺/商品与官方 HTTPS URL 所属；传给现有 RPC 的 merchant 使用当天已固定候选，snapshot 保留新的官方标量（包括新 shopName）。不修改 SQL 安全检查、日期槽位、预算、许可或失败回执。
- [x] 全量测试、TypeScript、ESLint及独立只读审查。
- [x] 提交并确认生产部署。
- [x] 记录生产验收边界：不重复运行整套新闻/AI，不改写 11/13、11/14 失败历史；下一次正常任务使用修正版。没有把旧 Actions 运行说成已成功。

不增加迁移，不重置终态运行，不绕过每天 HTTP12/AI1 或仅主账号限制。

生产：实现提交 `73f1763` 的 Vercel 部署 `Aju2Bohv2RcTTxc32RWz3fkurzao` 返回 success。未带认证的 cron GET 返回401 Unauthorized，在任何执行前被拒绝。未重新触发 Actions，也未修改已失败任务/设置/额度；原 run43547224133 仍是失败历史。实际新材料生成留待下一次正常定时任务，不把本轮隔离测试称作真实重新生成成功。

验证：314 文件2058项测试通过，TypeScript与ESLint均 exit0。PGlite 载入实际119/120/121/123迁移，通过“新店名直接写 merchant 仍被SQL拒绝、固定 merchant + 新 structured.shopName 可保存”的回归及既有租约/预算/仅主账号/不重复AI/原子发布测试。独立审查无需修改项。
