# 一手数据第一步:官报決算公告 设计文档

日期:2026-10-17
状态:五条决定已获用户同意,待用户审阅本文档

## 背景

用户说外部信号"信息还是不够,输出的内容质量不够好",四条都认(分析是空话、来源太浅、太多太散、周刊素材不够)。
排了顺序以后他改主意:"不,还是先想加数据吧"。在官报决算公告、法人番号新设法人、gBizINFO 里选了**官报决算公告**。

起因是他看到 kaijiwire.jp(把官报決算公告、EDINET、TDnet 整理成每家公司一页的网站),问能不能复刻并接上外部信号。
结论是不复刻全站(市场已经挤、数据有坑、时间不够),只做和他的方向接得上的一块:**在日本的中国公司的成绩单**,
同时让求职的岗位页能查到那家公司的官报决算。

## 用户同意的五条(2026-10-17)

1. **决算公告全存**(每天几十到一百多条),不只存中国公司 —— 岗位页也能用,名单以后变了不用重抓。
2. **在他电脑上跑**:填表助手每天第一次开起来时顺手抓一次,也能 `npm run kanpo:fetch` 手动跑;第一次补最近 90 天。
3. **数字只用规则抽,不让 AI 猜**;抽不全的标"没抽全",留原文给他自己看。
4. **中国公司名单**:他自己加(中国那边的名字 + 日本法人名的几种写法),可以从时差图谱、差距清单里挑;公司名匹配由代码做,对上的他确认。
5. **显示在三处**:时差图谱「在日本的结果」旁边;新页「在日本的中国公司成绩单」;岗位页显示那家公司最近一次决算公告。

## 试过的事实(2026-10-17,10 月 16 日的官报)

- kanpo.go.jp 最近 90 天全部免费,更早的要付费。每天:本纸 32 页、号外一到几份(一百到六百多页)。
- 每一页有单独的 PDF:`https://www.kanpo.go.jp/{日期}/{号}/pdf/{号}{4位页码}.pdf`(例:`20261016/20261016g00227/pdf/20261016g002270080.pdf`),
  一页 150–270KB。整份的 PDF 也有,但 10MB 级,不用。
- 每份的目次页 `…/{号}0000f.html` 列出「会社決算公告」从第几页开始(10 月 16 日在号外第 227 号第 80 页起,约 25 页);目次不列公司名,所以要读 PDF。
  那天本纸里没有决算公告栏(有「会社その他」,是合并、解散等)。
- 文字抽得出来:Node 的 `pdfjs-dist`(6.3.289,`cMapUrl` 给文件系统路径)和 Python 的 PyMuPDF 都行;pdfjs 的输出更整齐(标签在一行里,字和字之间有空格)。
- 第 80–83 页共 13 条决算公告,规则抽:12 条的公司名、单位、资产合计、当期纯损益四样都对(肉眼对过原文);1 条标题格式不同没切出来。
  利益剰余金为负数时写法不同,有几条没抽到。单位有千円、百万円。两条是外资的日本法人(Mott MacDonald Japan、Solutions Japan)。
- 每条的顺序固定:「第N期決算公告」→ 日期 → 所在地 → 公司名 → 代表者 → 「貸借対照表の要旨(○年○月○日現在)」→ 单位 → 科目和数字 → 利益剰余金 → 「(うち当期純利益/損失)(数字)」。
  不同公司模板不同:有的写「資産合計」,有的写竖排的「合 計」。

## 抓取(他电脑上)

`scripts/kanpo-fetch.ts`(`npm run kanpo:fetch`,可带日期范围),填表助手每天第一次开起来时也调一次(和岗位大搜同一个"今天跑过没有"的记法)。
每天的步骤:

1. 读当天的首页列表,拿到本纸、号外每一份的目次页。
2. 读每份目次,找「会社決算公告」的起始页;终止页取这一份的最后一页(目次页上的页数链接)。没有这一栏的份跳过。
3. 一页一页下载 PDF(间隔 0.5 秒,别给官网添负担),用 pdfjs 抽文字。
4. 切成一条条决算公告,按规则抽字段(下一节),存进数据库;同一天跑第二次不重复存(按"日期 + 份 + 页 + 页内第几条"去重)。
5. 记下这一天抓过(几页、几条、几条没抽全),下次跳过。

第一次跑补最近 90 天(大约几千页,跑一阵子,中途断了下次接着跑)。DNS 用现有的 `scripts/dns-patch.ts`。
Vercel 的定时任务不跑这个(60 秒不够,而且两个都占满了)。

## 切条和抽字段(纯函数,不用 AI)

- 先把每行里"字 空格 字"的空格去掉(pdfjs 输出的标签字和字之间有空格),全角数字和逗号转半角。
- 切条:以「第N期決算公告」或单独一行的「決算公告」为开头,到下一条开头为止;没有「貸借対照表」的不算决算公告。
  10 月 16 日那条没切出来的,实现时拿它当测试样本补上规则。
- 字段:
  - 公司名:「貸借対照表」之前、含「株式会社/有限会社/合同会社」的那一行;
  - 所在地:公司名前面一到两行;
  - 期:「第N期」;决算日:「(…現在)」里的原文;
  - 单位:円/千円/百万円;
  - 资产合计:「資産合計」(前面不是「純」),没有就取资产部之后第一个「合計」;
  - 纯资产合计、利益剰余金:有就取;前面带「△」「▲」「−」是负数;
  - 当期纯损益:「(うち当期純利益)」后面的数是正,「当期純損失」是负。
- 金额按单位换成日元存(整数),显示时由代码换成万円/亿円,并注明原单位。
- 公司名、单位、资产合计、当期纯损益四样都抽到才算"抽全";没抽全的照样存原文,标"没抽全",页面上给原文和官报那一页的链接。
- 抽到的每个数字都必须在这条的原文里(规则是从原文里截的,天然成立;测试里也核对)。

## 中国公司名单与匹配

- 名单一行:中国那边的名字(例:谭仔国际)、日本法人名的几种写法(例:株式会社譚仔日本、譚仔日本)、备注。他在新页上加、改、删。
- 也可以从时差图谱、差距清单里点"把它加进名单"(带上那边的名字,日本法人名他自己填 —— 不让 AI 猜日本法人名,猜错了会把别家的决算挂到它头上)。
- 匹配:公司名归一化(NFKC、去掉株式会社/(株)/有限会社/合同会社、去空格、英文字母统一大写)后,和名单里任一写法完全相同才算对上。
  对上的显示在名单那一行;他可以点"不是这家"解除(记下来,下次同名不再挂)。

## 显示

1. **新页 `/signals/kanpo`「在日本的中国公司」**(从时差图谱、差距清单进,不占导航):
   - 名单:每家一行 —— 中国那边的名字、日本法人名、最近一次决算(第几期、决算日、总资产、当期纯损益、利益剰余金;利益剰余金为负就写"累计亏损 ○亿円")、
     官报那一页的链接;有两年以上的就按期排成一列,只摆数字不画趋势评语。还没在官报里找到的写"最近 90 天的官报里还没找到它登决算"。
   - 加一家:中国那边的名字 + 日本法人名(可以写几种)。
   - 搜官报决算:在存下的全部决算公告里按公司名搜(名单之外的也能搜)。
   - 页脚一行:抓到哪天了、一共存了几条、几条没抽全;超过 3 天没抓就提醒「在你电脑上跑一下 `npm run kanpo:fetch`」。
   - 说明(固定一句):「只有在官报登决算公告的公司才查得到;很多公司登在自己网站上或者不登。官报免费的只有最近 90 天,这里从开始抓的那天往后攒。」
2. **时差图谱**:某一件"谁带进来的"对上名单里的公司、又找到了决算公告时,在「在日本的结果」旁边加一行小字:
   「官报:第N期(○年○月期)当期纯损失 ○亿円,累计亏损 ○亿円」+ 链接。只显示,不自动改结果那一档(改档还是他自己改)。
3. **岗位页**:岗位的公司名归一化后和存下的决算公告对上,就在岗位事实那一节下面加一行:
   「官报决算(第N期,○年○月期):总资产 ○亿円,当期纯利益 ○万円」+ 链接;对不上不显示(注明"查不到不代表没登")。

## 数据

迁移 `082_kanpo_notices.sql`(追加到 `supabase/schema.sql`,CRLF):

```sql
-- 官报决算公告：公开数据，不分用户（单用户阶段只用 service role 读写）
create table if not exists kanpo_notices (
  id                uuid primary key default gen_random_uuid(),
  notice_key        text not null unique,      -- 日期_份_页_页内序号
  issue_date        date not null,
  issue             text not null,             -- 例：号外第227号
  page              int not null,
  pdf_url           text not null,
  company_name      text,
  company_key       text,                      -- 归一化后的公司名（匹配用）
  address           text,
  period            text,                      -- 例：第14期
  fiscal_end        text,                      -- 原文，例：2026年７月31日現在
  unit              text,                      -- 円 / 千円 / 百万円
  total_assets      bigint,                    -- 换成日元
  net_assets        bigint,
  retained_earnings bigint,
  net_income        bigint,                    -- 亏损为负
  complete          boolean not null default false,
  raw_text          text not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_kanpo_notices_company on kanpo_notices (company_key);
create index if not exists idx_kanpo_notices_date on kanpo_notices (issue_date desc);
alter table kanpo_notices enable row level security;

-- 哪天抓过
create table if not exists kanpo_fetch_days (
  issue_date  date primary key,
  pages       int not null,
  notices     int not null,
  incomplete  int not null,
  fetched_at  timestamptz not null default now()
);
alter table kanpo_fetch_days enable row level security;

-- 他的中国公司名单
create table if not exists kanpo_watch (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name_zh     text not null,
  aliases     text[] not null,                 -- 日本法人名的几种写法（原样存，匹配时归一化）
  rejected    text[] not null default '{}',    -- 他点过"不是这家"的 company_key
  note        text not null default '',
  created_at  timestamptz not null default now()
);
alter table kanpo_watch enable row level security;
drop policy if exists "kanpo_watch_owner" on kanpo_watch;
create policy "kanpo_watch_owner" on kanpo_watch for all using (auth.uid() = user_id);
```

迁移没跑时,新页显示"迁移 082 还没跑";时差图谱和岗位页不显示那一行,别的照常。

## 宪法

- signals 那一行补:「**官报决算公告**(一手数据第一步,经用户同意 2026-10-17;迁移 082):他电脑上每天抓当天官报的会社決算公告(`npm run kanpo:fetch`,
  填表助手每天开起来时也跑;第一次补最近 90 天;一页一页下 PDF、pdfjs 抽字、间隔 0.5 秒),全部存;字段只用规则抽、不让 AI 猜数字,抽不全标出来留原文;
  金额按单位换成日元存;中国公司名单他自己维护(日本法人名不让 AI 猜),公司名归一化后完全相同才算对上,他可以解除;
  显示在 /signals/kanpo「在日本的中国公司」、时差图谱「在日本的结果」旁(只显示不改档)、岗位页(查不到不代表没登);不打分、不写趋势评语」。
- jobs 那一行补一句岗位页显示官报决算。
- Schema 段加三张表。
- 依赖:`pdfjs-dist` 6.3.289(devDependency,只在本机脚本用)。

## 文件

- `lib/domains/signals/kanpo-shared.ts`:去空格、切条、抽字段、单位换算、公司名归一化、匹配、金额显示(纯函数)。
- `lib/domains/signals/kanpo-shared.test.ts`:拿 10 月 16 日第 80–83 页 pdfjs 抽出的文字当样本(存成 `lib/domains/signals/__fixtures__/kanpo-20261016-p80-83.txt`)。
- `lib/domains/signals/kanpo-fetch.ts`:读首页和目次、下载页 PDF、pdfjs 抽字(只在本机脚本里用,不进 Next 的页面)。
- `lib/domains/signals/kanpo.ts`:存决算公告、记抓过哪天、名单增删改、匹配查询、岗位页和时差图谱要的查询。
- `scripts/kanpo-fetch.ts`、`scripts/jobs-helper.ts`(每天顺手跑一次)、`package.json`(`kanpo:fetch`、devDependency)。
- `app/(app)/signals/kanpo/page.tsx` + 客户端组件(加一家、搜索、解除匹配)。
- `app/(app)/signals/atlas/...`、`app/(app)/signals/gaps/...`:进新页的链接、"加进名单";时差图谱那一行小字。
- `app/(app)/jobs/[id]/posting-facts.tsx` 或 `page.tsx`:官报决算那一行。
- `supabase/migrations/082_kanpo_notices.sql`、`supabase/schema.sql`、`CLAUDE.md`。

## 测试

- 样本 13 条:切出 13 条(包括那条标题格式不同的);12 条已知的四样数字对得上(例:菊池食品工业 资产合计 4,610,959 千円 → 4,610,959,000 円,当期纯利益 19,973 千円;
  XAIONDATA 当期纯损失 207,973 千円 → 负;パシフィック 单位百万円);利益剰余金负数能抽到;每个抽到的数字都在原文里。
- 公司名归一化:「株式会社譚仔日本」「（株）譚仔日本」「譚仔日本株式会社」归一成同一个;英文大小写、全角半角统一。
- 匹配:完全相同才对上;被解除的不再挂。
- 金额显示:千円、百万円换成日元后,按大小显示成万円/亿円,保留原单位说明。
- 验证照项目约定:`npx tsc --noEmit` + `npm run lint` + `npm test`;抓取在本机手动跑一天的、再补几天,看条数和没抽全的比例。

## 用的时候会碰到什么、怎么算有用

- 用的时候:第一次跑完 90 天以后,往名单里加 10 到 20 家在日本的中国公司,看找到了几家;写周刊时拿官报数字讲「进来以后结果怎样」;
  投非上市公司之前,在岗位页看一眼它的官报决算。
- 算有用:两周内(到 2026-10-31)至少一次把官报的数字用进一期周刊或一次面试准备;名单里找到决算的公司 ≥ 3 家。
  一家都找不到的话,说明这些公司多半不在官报登,回头看要不要换法人番号或 gBizINFO。

## 不做的

- 不解析损益计算书(大多数决算公告只有贷借对照表);不做 EDINET、法人番号、gBizINFO(之后一步)。
- 不让 AI 抽数字、不让 AI 猜日本法人名、不让 AI 判断哪家是中国公司。
- 不做公开页、不给别人看;不打分、不写"经营状况良好/恶化"这类评语,只摆数字和期数。
- 不抓官报的其他公告(合并、解散、破产)—— 以后要的话另说。

## 写计划时补的(2026-10-17)

- 官报的负号是私用区字符:横排 U+E888、竖排 U+E6F0,按负号认;不认的话累计亏损全被读成正数。
- 竖排的决算公告用汉字数字(「四〇、八五二」)、「資産の部合計」、公司名在表后面;公司名会折成两行(上一行以「・」结尾或全是英文)。
- 时差图谱的每一件没有日本法人名那一格,所以从图谱加进名单时记下那一件的 id(`kanpo_watch.case_id`),图谱按 id 显示;差距清单的条目是产品不是公司,只放入口链接。
- 官报首页列着最近 90 天每一份的整份链接(文件名带页码范围),当天全体目次里「会社決算公告」的链接带起始页,一天只要读首页和目次两个网页再加那几页 PDF。
- pdfjs 6 的 `destroy()` 在 loadingTask 上,不在 doc 上。
