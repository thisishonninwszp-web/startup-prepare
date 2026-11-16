# 经营条件变更练习（提案②）

承接用户对五项提案的认可及本轮“続き”。嵌入成长轴 business-lab，不新增一级导航或决策闭环。

## 完整工作流

选择本人案例 → 明确是假设的条件变化 → 写自己的行动、谁承担代价、如何核对 → 保存/回读/编辑/删除。模板为供货改预付、主要集客渠道不可用、退货增加、交付延迟及自定；不声称这些事实际发生。固定确认问题由代码提供并标明不使用AI。案例标题实时按 owner 解析，不复制报告/材料正文。来源不可用时保留本人独立回答，明确来源缺失。

可选择额外的 Gemini 追问：先保存当前回答，展示实际发送的 JSON（仅案例公开名称、假设情境、自己的选择和独立说明，不读私人笔记、报告正文或其他模块）。本人逐次确认公开/去身份信息并允许发送至 Google Gemini，点击后才发送。默认不开启，不加定时任务。用户修改回答后，旧许可和旧追问不能冒充当前版本。

AI只选择针对回答中具体原话的质疑角度，不给评分、鼓励或经营事实；provider结构是 `questions:[{questionKey,answerQuote}]`，questionKey只允许前提、停止条件、代价和核对四种，原话逐字核对。代码把角度映射为固定的假设性反问，SQL也只接受这四句；任意自由文不得作为有效追问显示，界面明确说明这一限制。经 lib/ai/ +统一gateway，metadata_only日志，单次provider尝试。SQL租约/请求回执保证同请求重试不再次付费；已发出但无法确认的请求保持unknown，不自动补发。送信开始前到达的许可撤回也记录，阻止后续请求。成功问题绑定原回答版本；编辑后旧问题仍标旧版本。无效响应原文隔离为本人诊断，普通列表不带原文，删除练习同步删除诊断。

## 契约与安全

`PressurePlan={caseId,scenarioKey,changedCondition,action,tradeoff,checkNext}`；文字均本人独立填写，候选模板只是练习假设。owner由server action会话决定；新表/事务RPC严格SQL及Zod检查、service role guard、乐观版本、幂等回执（仅hash/id）、分页与清除。无任何ideas/validations/career写入。与制作练习、资金表通过同一案例的明确链接相连，不暗中复制内容。

文件边界：lib/domains/business-teardowns/pressure/**、lib/ai/business-pressure.ts、app/(app)/business-lab/pressure/**、130_business_pressure.sql。schema.sql/公共入口由root统一整合。测试含真实130迁移、权限、版本、source失效、AI请求/响应丢失与撤回后不可提交、无效输出隔离、输入保护。
