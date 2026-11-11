# 生意研究四项联动设计（2026-11-11）

用户已批准四项全部实现，复用现有模块，不增加一级导航或独立决策闭环。入口 /business-lab/research，案例页可带caseId进入。先做完整的材料驱动工作流：选择本人已有材料、核对原话、保存结构化研究、再读和修改、来源变化提示、明确删除。系统按研究类型生成对抗性核对问题；不需要额外模型调用即可使用全部四项。

## 共同边界
- 原始信息仍从材料箱/已有生意快照/已保存招聘页进入；研究表单只整理已有材料，不成为第二个原始输入口。
- 不生成评分，不写validations、ideas状态或last_activity_at，不从岗位标题/阅读行为推断能力。
- 所有服务端操作认证owner，SQL重复owner/来源验证。RPC使用supabaseAdminUncached。
- 无后台抓取或新AI调用。用户解释明确是待核对的整理，只有逐字来源可以作为引文。
- 迁移124；默认沿用BUSINESS_TEARDOWNS_ENABLED。缺迁移明确提示，不影响已有每日报告。
- sources只存sourceKind/sourceId/quote起始位置/长度/内容hash/public确认，不存原文副本。读取时从当前来源还原；hash变化标失效并隐藏研究payload，来源清除/删除触发清除研究标题、payload和引用位置，避免从派生内容恢复原文。确认经历撤回后标失效，不能继续作经验依据。
- 写入带expectedRevision和requestId，回执只保存输入hash及id/revision，不另存引用正文。重复请求无重复创建，冲突不覆盖输入。list按created_at/id分页。

## 共享TS接口（领域层定义于research/domain.ts）
SourceKind = 'snapshot' | 'material' | 'job'
ResearchKind = 'failure' | 'comparison' | 'tension' | 'apprenticeship'
SourceInput = {key:string,kind:SourceKind,id:string,quote:string,publicConfirmed:boolean}
SourceOption = {id:string,kind:SourceKind,title:string,text:string,url:string|null,date:string|null}
CaseOption = {id:string,name:string,date:string}
ExperienceOption = {id:string,label:string,text:string}
ResearchInput = {id?:string,kind:ResearchKind,title:string,caseIds:string[],experienceIds:string[],sources:SourceInput[],payload:Record<string,unknown>,expectedRevision:number,requestId:string}
ResearchRecord = {id:string,kind:ResearchKind,title:string,caseIds:string[],experienceIds:string[],payload:Record<string,unknown>|null,revision:number,createdAt:string,updatedAt:string,erasedAt:string|null,invalidated:boolean,experienceInvalidated:boolean,sources:(SourceInput & {url:string|null,date:string|null,invalidated:boolean})[]}
ResearchList = {available:boolean,items:ResearchRecord[],nextCursor:string|null}

payload严格按kind选字段，字符串必填、trim非空且每项最多3000字符，when可空表示日期未知：
- failure: {event:'exit'|'shrink'|'stop',when:string,scope:'company'|'store'|'product',disclosureKey:string,confirmedDisclosure:true,whatChanged:string,alternative:string,condition:string,checkNext:string}。disclosureKey须指snapshot/material引文，逐字且人工明确确认退出披露。退出事实和经营原因分开。
- comparison: {dimensions:{key:'buyer'|'user'|'payer'|'trigger'|'delivery'|'alternative',left:string,right:string,leftSourceKey:string|null,rightSourceKey:string|null}[],hypothesis:string,counterexample:string,checkNext:string}。必须恰好2个不同caseId；6维固定，左右整理无出处即标待核对，不暗示因果。
- tension: {task:string,leftNeed:string,rightNeed:string,leftSourceKey:string,rightSourceKey:string,tradeoff:string,alternative:string,checkNext:string}。两侧逐字引文指snapshot/material，不能完全同一段引文；不等于总体需求或付费验证。
- apprenticeship: {mechanism:string,timeBudget:string,cashBudget:string,constraintsConfirmed:true,gap:string,practice:string,checkNext:string,jobLink:null|{jobId:string,sourceKey:string,rationale:string,employerQuestion:string}}。jobLink须指本人已存岗位body的逐字引文，不从title猜职责；experienceIds只允许仍confirmed的本人底稿。预算/经历由用户明确选择确认。

## 领域API（research/commands.ts与queries.ts）
saveResearch(owner,input) => {id,revision}
listResearch(owner,{kind?,before?}) => ResearchList (missing124返回availablefalse，仅缺表/函数错误可降级)
getResearch(owner,id) => ResearchRecord|null
eraseResearch(owner,{id,requestId}) => void
listResearchCases(owner,{before?}) => {items:CaseOption[],nextCursor:string|null}
listResearchSources(owner,{kind:SourceKind,search?:string,before?:string}) => {items:SourceOption[],nextCursor:string|null}
listResearchExperiences(owner) => ExperienceOption[] (只confirmed，缺078返回空并由UI链接底稿)
researchQuestions(kind,payload) => string[] (代码生成待核对问题，严禁冒充AI结论)
sourceKey使用短ASCII标识如s1，禁止重复。引文4..1600字符，最多12个来源；caseIds最多2，failure/tension/apprenticeship至少1。experienceIds最多20，非apprenticeship为空。所有uuid校验。

## SQL接口与表
business_research_records(id,user_id,kind,title,case_ids jsonb,experience_ids jsonb,payload jsonb,revision,created_at,updated_at,erased_at)
business_research_refs(user_id,record_id,source_key,source_kind,source_id,quote_start,quote_length,content_hash,public_confirmed)
business_research_receipts(user_id,request_id,input_hash,result jsonb)
business_research_command(p_user_id,p_operation,p_input) 仅service_role，操作save/list/get/erase，DTO返回上面的camelCase。
source resolver严格读取本人业务快照且属于所选case成员、本人未删除material.sanitized_text、本人job.body；不可读取input_text/privateFeedback/job_profiles.personal。
写入先锁来源行再锁记录行，防止与来源清除死锁。源数据变动引用失效；source删除/erasure触发物理清除依赖研究的标题/payload，不能只显示占位却保留派生原文。无需修改旧report/learning操作定义。

## UI与集成
主页面及案例页链接四项研究；单一研究页提供类型过滤、创建/编辑/删除、分页和保留错误输入。各类型专属表单、出处选择/原文预览/逐字摘录、case选择、确认经历选择、岗位职责摘录。清楚区分用户整理、原文与未知。使用PageContainer/Button/ConfirmButton语义tokens。输入来源从材料箱保存后可回研究；官方API无captured_text时不能伪造引文。
保存成功但列表刷新失败时说明已保存，不再次创建；请求id按相同输入保留。来源已失效的研究可查看失效说明，清除后的不提供旧正文。
