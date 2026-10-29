# 生产发布与真实验收记录

2026-10-29，用户授权尝试部署、生产配置和真实流程。

## 已完成

- GitHub CLI在允许联网后认证有效；原先沙箱网络错误不代表凭据失效。
- 获取origin/main的8c6b2af线上新闻改进；提交功能360fda4并合并为b4b2598af2d08d799d101620cac281c05e09b245，快进推送main。排除用户的.claude/launch.json、本地.tmp与规划日志。暂存代码对本地敏感环境变量值扫描通过，未发布凭据。
- 合并后297文件1904测试、生产build通过。
- Vercel生产部署dpl_yaNUnzeJTqxz2AMVTUjBnLaBBfLK显示Ready，正式域名https://startup-prepare.vercel.app。
- 仅新增生产BUSINESS_TEARDOWNS_ENABLED=true，真实页面和导航可用。
- 在现有已登录账号通过生产乐天凭据查询“収納 ケース”，返回30个真实候选；选定くらしのeショップ（e-kurashi），商品e-kurashi:10007962，来源https://item.rakuten.co.jp/e-kurashi/q5363/。
- 保存今日真实验收案例67dbed78-c9ba-4a4a-991b-42f83c5aa1c2，刷新、独立详情读取成功。原价范围4699–12999JPY，评价字段7611；未把评价写成销量或真人需求。
- 生产存在RAKUTEN_ACCESS_KEY；此前缺项只指本地，当前已用实际查询证明生产凭据可用。没有读取、复制或改写密钥值。
- 未登录访问business-lab及案例返回307到/login；未授权cron请求返回401。发布后全模块只读schema检查再次通过。

## 2026-10-30：验证后真实生成排障

- 用户已完成Vercel验证。正常重新部署Ee4fEx6xyzRUfw6e9ACHtR9RT3uy显示Ready，生产域名指向该部署；源码仍为b4b2598，手动AI入口已生效。
- 在既有验收案例上明确勾选唯一官方公开快照及本次范围确认，保存许可后仅调用一次Gemini。未发送私人笔记，未启用自动生成。
- 生产日志确认模型返回sections对象，而报告契约要求数组；Zod拒绝保存，没有生成或发布不合格报告。许可已消耗，没有直接重试同一许可。
- 修复使用现有Zod结构生成responseJsonSchema传给Gemini，明确数组形状，prompt版本更新为business-report-v2。保留原有事实引用、内容检查和单次调用机制，不把错误对象静默转换为报告。
- 回归测试先确认缺少输出约束会失败，再加入结构约束；相关29文件159测试及TypeScript检查通过。生产构建与修复部署验收继续进行。
- 首轮修复2b678a4的生产部署6LorAFyDxXqp4NVnTzqQpfrp6QCX已Ready。逐次重新确认后复测，Google返回400；SDK的retryOptions包装丢失了响应体，日志只显示provider_error。使用不含真实资料的合成样本，经既有gateway诊断确认：嵌套长度约束导致解码状态过多。
- 从同一Zod契约导出模型端结构时仅去掉minItems/maxItems/minLength/maxLength；服务器原始schema及所有内容/引用规则保持严格。加入测试确认模型端结构较简、服务器仍拒绝章节缺失。合成样本已由真实gemini-2.5-flash接受，29文件159测试再次通过；prompt版本更新为business-report-v3。尚待该版本部署及真实案例复测。

## 前次等待记录（已解除）

- 单独保存BUSINESS_TEARDOWNS_AI_ENABLED=true，目的仅为逐次授权手动生成；BUSINESS_TEARDOWNS_JOBS_ENABLED和自动定时任务未启用，其余新模块开关保持原状态。
- 选择同一b4b2598版本重新部署时，Vercel要求邮箱6位代码；已通过其正常界面请求代码，页面留在Chrome等待用户输入。Gmail连接返回一次性代码已隐藏，不尝试从其他接口绕过隐藏或验证。
- 该次重新部署尚未完成；当前运行版本仍显示AI未开启，尚未进行真实Gemini生成、发布或学习记录保存。
- 不得用新Git push、CLI、私有API或其他方式绕过当前Vercel重新验证。用户在现有验证页完成后，再检查该部署是否创建、Ready及正式域名更新；然后才继续逐次材料许可→生成→发布测试。

## 自动审批说明

“跳过账户安全提示”被自动审批拦截，未执行该操作，未修改账户保护。随后直接使用正常环境变量界面完成只读检查及材料入口设置。

一次性开启所有模块、AI与自动任务也被自动审批拦截，原因是手动流程未验收。后续改成只启用材料入口，真实材料成功后单独保存手动AI开关；自动任务始终关闭，不绕过原拦截。

## 本地证据

授权visualizations目录下production-business-material.png保存了正式站点真实材料页面截图。所有额外生产动作仍需先满足当前验证；无真实validation/status/last_activity_at改写，无对外消息发送或自动采集timer安装。
