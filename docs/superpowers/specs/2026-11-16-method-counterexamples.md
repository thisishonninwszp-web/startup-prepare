# 给本人方法找反例（提案④）

在既有方法库和生意案例里进入 /business-lab/counterexamples。选择本人确认的方法（122 operation=method或本人lesson，复用现有方法库语义），选择本人反例候选案例，写为什么可能冲突、哪些条件其实不同、需要补什么核对。此内容是本人假设，不因选了案例就宣称原方法被推翻。

保存、回读、编辑、删除和分页完整。方法原文及条件只从当前owned来源读取，不在研究记录或回执复制；保存基线hash。原方法改变或被清除后，显示不能沿用旧照合，隐藏不可读取的原文，不能悄悄把旧记录套在新方法上。候选案例名称也实时解析；独立填写的比较/改写草稿保留并明确来源已失效。

编辑“适用条件下的方法”草稿，结构为 method/scenario/conditions/failureConditions/unknowns。只有本人明确确认后，才能用现有business_learning_command的method操作追加一条本人方法；不覆盖/删除旧方法。追加时在同一事务重新核对原方法hash、来源归属、原报告可读性及案例。保存一份反例研究本身不自动追加方法。请求幂等且返回方法id；不写真实验证、ideas状态/活动或career，不调用AI。

UI并排原方法/成立条件与本人反例解释，代码给出核对提示：是否相同任务、付款者/买家、资源条件，是否只是原条件不成立。未知保持未知；不加成功率/质量分或证据等级。用户采用前展示全部草稿与将写入的已有方法库位置。

文件：lib/domains/business-teardowns/counterexamples/**、app/(app)/business-lab/counterexamples/**、132_business_method_counterexamples.sql；公共入口和schema.sql由root整合。独立owner/RPC、严格SQL+Zod、版本/幂等/分页、来源失效及方法追加回滚/重试测试，使用真实119/120/122/129迁移验证。记录删除不删除已由本人另行确认保存的方法；清楚告知。
