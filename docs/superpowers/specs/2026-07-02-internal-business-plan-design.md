# 内部经营计划书安全导入设计

## 目标

为 IdeaOS 增加唯一的“我的公司”内部经营档案。用户可以导入包含战略、财务预测、成本结构、販管費和供应商信息的 Excel 经营计划书，在不上传原始工作簿和不暴露供应商名称的前提下，获得可追溯到工作表与单元格范围的 AI 分析。

系统必须提高现状理解的精度，但不能把经营计划、预测或 AI 推演误写成已经发生的事实。

## 产品边界

“我的公司”显示在公司档案入口中，但不复用现有 `companies` 目标公司数据。现有公司类型 `prospect / customer / both` 继续服务于外部公司研究和求职触达；内部经营数据使用独立表、独立查询和独立 AI 上下文，禁止被求职触达、普通知识库或其他 AI 功能自动读取。

第一版每个用户只能有一个内部公司档案。

新增页面：

- `/companies/my`：当前经营计划版本、导入状态、最近变化和提问入口。
- `/companies/my/import`：Excel 本地解析、供应商脱敏和上传确认。
- `/companies/my/plans/[version]`：经营计划快照、详细表格来源和版本差异。
- `/companies/my/ask`：针对当前或指定版本提问。

现状认识只提供用户主动触发的“引用经营计划”入口，不自动注入内部经营数据。

## Excel 导入流程

### 文件限制

- 仅接受 `.xlsx`。
- 单文件最大 10 MB。
- 读取全部可见工作表。
- 隐藏及 very-hidden 工作表不参与处理，也不上传。
- 拒绝 `.xls`、`.xlsm`、密码保护文件、包含宏的文件和包含外部工作簿链接的文件。
- 第一版不解析图片、图表、批注、数据透视表和嵌入对象。

### 浏览器本地解析

浏览器动态加载 Excel 解析库，读取：

- 工作表名称和可见性。
- 实际使用区域。
- 单元格显示值、数值类型、公式和单位。
- 合并单元格及表头关系。

原始 `File`、`ArrayBuffer` 和未脱敏工作簿不得提交给 Server Action、Supabase Storage、Gemini 或日志系统。

### 脱敏

浏览器根据以下来源生成供应商候选：

- 用户维护的供应商名称清单。
- 日本公司常见后缀和前缀，例如“株式会社”“有限会社”“合同会社”。
- 同一文本在工作簿中的重复出现。

候选必须由用户确认。确认后，以稳定别名“供应商A、供应商B……”替换所有可见工作表中的匹配文本。

系统向服务端发送供应商名称仅用于计算带服务端密钥的 HMAC。服务端不得记录或保存明文名称；数据库只保存 `name_hmac`、稳定别名和创建时间。下次导入时以 HMAC 复用别名。

邮箱、电话、银行账号、法人番号和明显的个人姓名使用确定性规则遮蔽。无法确定的候选在预览中标记，未经用户确认不得进入上传阶段。

金额、比例、预算和财务预测默认保留精确值，因为这些内容直接影响经营分析。用户可以在导入确认页将指定列改为金额区间。

### 分块

确认后的脱敏工作簿转换为规范化 JSON，不上传 Excel 二进制。系统按“工作表＋连续表格区域”切分，每块：

- 不超过 500 行。
- gzip 后不超过 1.8 MB，为 Storage 的 2 MB 硬限制保留余量。
- 重复必要表头。
- 包含工作表名、单元格范围、单位、公式结果和内容哈希。
- 使用稳定顺序，保证同一内容可去重。

浏览器通过短时签名上传地址把分块写入 Supabase 私有 bucket。上传可逐块重试；任何分块失败时，导入保持 `uploading` 或 `failed`，不能生成部分经营计划快照。

## 数据模型

迁移文件使用 `022_internal_business_plan.sql`。

### `own_company_profiles`

- `id`
- `user_id`，唯一
- `display_name`
- `created_at`
- `updated_at`

### `business_plan_imports`

- `id`
- `user_id`
- `profile_id`
- `version_no`
- `status`: `uploading / extracting / awaiting_confirmation / completed / failed`
- `file_name`
- `file_size`
- `workbook_hash`
- `visible_sheet_count`
- `chunk_count`
- `previous_import_id`
- `error_code`
- `created_at`
- `completed_at`

已完成版本不可覆盖。相同 `workbook_hash` 不重复创建版本。

### `business_plan_chunks`

- `id`
- `user_id`
- `import_id`
- `sheet_name`
- `cell_range`
- `ordinal`
- `storage_path`
- `content_hash`
- `compressed_size`
- `row_count`
- `column_count`
- `created_at`

`storage_path` 指向私有 bucket 中的脱敏 JSON。路径固定为 `{user_id}/{import_id}/{ordinal}.json.gz`。

### `business_plan_supplier_aliases`

- `id`
- `user_id`
- `name_hmac`
- `alias`
- `created_at`

`(user_id, name_hmac)` 和 `(user_id, alias)` 均唯一。禁止保存供应商明文。

### `business_plan_extractions`

- `id`
- `user_id`
- `import_id`
- `chunk_id`
- `facts`
- `plans`
- `forecasts`
- `cost_items`
- `assumptions`
- `risks`
- `unknowns`
- `source_refs`
- `created_at`

每条结构化内容必须包含工作表名、单元格范围和证据类型。

### `business_plan_snapshots`

- `id`
- `user_id`
- `import_id`，唯一
- `summary`
- `strategy`
- `financial_outlook`
- `cost_structure`
- `selling_general_admin`
- `assumptions`
- `risks`
- `unknowns`
- `source_refs`
- `delta`
- `created_at`

快照及相邻版本差异不可覆盖。

### `business_plan_questions`

- `id`
- `user_id`
- `import_id`
- `question`
- `answer`
- `source_refs`
- `created_at`

回答只保存结构化结果，不保存发送给模型的完整表格上下文。

所有表启用 RLS。业务代码继续使用 service-role 时，每个 Server Action 必须验证用户、档案、导入版本、分块和问题归属。

## Storage

创建私有 bucket `internal-business-plans`：

- 禁止公开 URL。
- 用户只能访问自己 ID 前缀下的对象。
- 上传仅使用短时签名地址。
- MIME 类型只允许 `application/json` 和 `application/gzip`。
- 单个分块限制 2 MB。
- 删除导入版本时同步删除全部 Storage 对象。

原始 Excel 不进入 bucket。Supabase Free 套餐已支持私有 bucket、RLS 和自定义访问控制；第一版不依赖 Pro 功能。

## AI 设计

新增结构化接口：

### `extractBusinessPlanChunk`

输入一个脱敏表格分块，输出：

- 已发生且可核对的事实。
- 计划中的行动。
- 尚未发生的预测。
- 成本与販管費项目。
- 关键假设。
- 风险和未知。
- 每项对应的工作表及单元格范围。

### `buildBusinessPlanSnapshot`

聚合全部成功分块。只有所有分块提取成功后才能创建快照。禁止用 AI 补齐缺失工作表或缺失数字。

### `compareBusinessPlanVersions`

输出新增事实、战略变化、预测变化、成本结构变化、販管費变化、新增或解决的未知。只描述有来源的变化，不评分、不判断经营好坏。

### `answerWithBusinessPlan`

先按工作表、来源引用、关键词和结构化类别检索相关分块，再把最少必要内容发送给 Gemini。回答必须包含：

- 表格明确内容。
- AI 推断。
- 未知或缺失依据。
- 工作表及单元格引用。

禁止输出无依据的财务结论、成功率、经营评分或把预测描述为事实。

## 与现状认识连接

用户在现状课题中主动选择一份已完成经营计划快照。系统保存引用时快照，不自动跟随新版变化。

经营计划中的：

- 实际结果可作为带来源的事实候选。
- 战略、预算和预测只能作为计划或解释。
- 缺失数字和冲突可进入未知或矛盾。
- AI 推断不能进入现状事实。

用户必须确认后才能创建新的现状版本。

## AI 日志与安全

内部经营计划相关调用必须启用 `metadata_only` 诊断模式：

- 保存请求 ID、模型、耗时、错误类型和重试次数。
- 不保存请求正文、响应正文、表格分块或提取内容。

其他安全规则：

- 必须使用关联有效 Cloud Billing 的 Gemini API 项目。
- 单元格内容作为不可信数据处理，忽略其中所有指令。
- 服务端错误和 Vercel 日志不得输出单元格内容、供应商候选或完整 AI 响应。
- 签名 URL 短时有效且不能被日志记录。
- HMAC 密钥和 Storage 管理密钥只存在于服务端环境变量。
- 删除内部公司档案时级联删除数据库记录和 Storage 对象。

## 错误与恢复

- 本地解析失败时不上传任何数据。
- 脱敏未确认时不创建上传地址。
- 分块上传支持幂等键和单块重试。
- AI 提取失败保留已上传分块，但不创建空快照。
- 用户可重试失败分块，不重复处理已成功且哈希未变化的分块。
- 聚合失败不覆盖旧版本。
- 删除未完成导入时清理已上传对象。

## MVP 验收

- 3 MB Excel 可在浏览器解析全部可见工作表。
- 原始 Excel 不出现在网络请求、Storage、数据库或 AI 日志。
- 隐藏工作表不会进入脱敏预览或上传。
- 供应商名称在发送 Gemini 前已替换，并能跨版本保持稳定别名。
- 精确金额、公式结果、工作表和单元格范围得到保留。
- 全部分块成功后才创建不可覆盖快照。
- 后续提问无需重新上传文件，并能引用具体单元格范围。
- 用户可主动把快照带入现状认识。
- 跨用户档案、分块、对象路径和问题访问均被拒绝。
- 删除版本后数据库记录和 Storage 对象均被清理。
- Vitest、ESLint 和 Next.js production build 通过。

## 暂不实现

- `.xls`、`.xlsm`、CSV 和密码文件。
- 图片、图表、批注、数据透视表和嵌入对象理解。
- 多个内部公司主体。
- 自动生成经营计划或修改 Excel。
- 自动把经营数据注入所有 AI 请求。
- 经营评分、排名、成功率或自动 Go/Kill 决策。
