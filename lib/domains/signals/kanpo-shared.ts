/**
 * 官报決算公告：切条、抽字段、公司名归一化、金额显示（纯函数，可测；页面和本机脚本都用）。
 * 规矩：数字只用规则从原文里截，不让 AI 猜；四样（公司名、单位、资产合计、当期纯损益）抽不全的标出来，原文留着给他自己看。
 */

export type KanpoUnit = "円" | "千円" | "百万円";

export type ParsedNotice = {
  company_name: string | null;
  address: string | null;
  period: string | null;
  fiscal_end: string | null;
  unit: KanpoUnit | null;
  /** 以下金额都换成日元（整数）。 */
  total_assets: number | null;
  net_assets: number | null;
  retained_earnings: number | null;
  /** 亏损为负。 */
  net_income: number | null;
  complete: boolean;
  raw_text: string;
};

/** 抓下来、准备存进数据库的一条。 */
export type KanpoNoticeInput = ParsedNotice & {
  notice_key: string;
  issue_date: string;
  issue: string;
  page: number;
  pdf_url: string;
};

export type KanpoNotice = KanpoNoticeInput & { id: string; company_key: string | null };

export type KanpoWatch = {
  id: string;
  name_zh: string;
  aliases: string[];
  rejected: string[];
  note: string;
  case_id: string | null;
  created_at: string;
};

const UNIT_FACTOR: Record<KanpoUnit, number> = { 円: 1, 千円: 1000, 百万円: 1_000_000 };
const KANJI_DIGITS = "〇一二三四五六七八九";
/** 官报字体把「△」映射到私用区：横排 U+E888，竖排 U+E6F0。 */
const MINUS = "[△▲−\\-\\uE888\\uE6F0]";
const DIGIT = "[0-9０-９〇一二三四五六七八九]";
/**
 * 千位分隔：「,」「，」「、」，有的公告用私用区字符（见过 U+EA75）。分隔后面必须正好三位数，
 * 这样地址里数字之间的私用区横杠（「16-28」）不会被当成分隔；两个负号 U+E888、U+E6F0 不算分隔。
 */
const SEPARATOR = "[,，、\\uE000-\\uE6EF\\uE6F1-\\uE887\\uE889-\\uF8FF]";
const NUMBER = `(${MINUS})?\\s*(${DIGIT}+(?:${SEPARATOR}${DIGIT}{3})*)`;
const PERIOD = /第\s*[0-9０-９〇一二三四五六七八九十百]+\s*期/;
/** 「第37期決算公告」之外，也有「令和７年度決算公告」「2026年３月期決算公告」这样起标题的。 */
const HEADER = /第\s*[0-9０-９〇一二三四五六七八九十百]+\s*期\s*(?:修正)?決算公告|^決算公告$|^[^\s、。，,（）()]{0,12}(?:年度|期)決算公告/gm;
/** 别的公告的标题（合併公告、資本金の額の減少公告、解散公告……）：单独一行、短、以「公告」结尾。 */
const OTHER_TITLE = /^[^\s、。，,]{0,14}公告$/m;
const COMPANY = /(株式会社|有限会社|合同会社|（株）|\(株\)|特定目的会社|一般社団法人|一般財団法人|社会医療法人|医療法人)/;
/** 「株式会社」被折行拆开：这一行以「株式/合同/有限」结尾，下一行以「会社」开头。 */
const SPLIT_SUFFIX = /(株式|合同|有限)$/;
const REPRESENTATIVE = /代表取締役|代表執行役|取締役|代表社員|代表理事|理事長|清算人/;
const PREFECTURE = /(東京都|北海道|大阪府|京都府|[^\s\d０-９]{2,3}県)[^\n]*/;

function toInt(sign: string | undefined, token: string): number | null {
  const ascii = [...token]
    .map((c) => {
      const k = KANJI_DIGITS.indexOf(c);
      if (k >= 0) return String(k);
      const code = c.charCodeAt(0);
      if (code >= 0xff10 && code <= 0xff19) return String(code - 0xff10);
      return c;
    })
    .join("")
    .replace(/[,，、-]/g, "");
  if (!/^\d+$/.test(ascii)) return null;
  const n = Number(ascii);
  return sign ? -n : n;
}

function numberAfter(label: string, block: string): number | null {
  const m = new RegExp(label + "\\s*[(（]?\\s*" + NUMBER).exec(block);
  return m ? toInt(m[1], m[2]) : null;
}

/** pdfjs 给标签的每个字之间加了空格：两边都不是 ASCII 的空格去掉，英文名里的空格留着。 */
export function squashCjk(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/(?<=[^\x00-\x7f])[ 　\t]+(?=[^\x00-\x7f])/g, "").trim())
    .join("\n");
}

/**
 * 一条决算公告到哪为止。下一条决算公告的标题之外，还有两种情况会把别人的数字串进来：
 * 后面跟着合併公告之类（里面常有「最終貸借対照表の要旨」）；别家的贷借对照表接在后面、它的标题落在了别处。
 * 所以从自己的贷借对照表往后找，碰到别的公告的标题，或者已经出现过「合計」又来一个「貸借対照表」，就切在那一行。
 */
function ownPart(block: string): string {
  const bs = block.indexOf("貸借対照表");
  if (bs < 0) return block;
  let end = block.length;
  const title = OTHER_TITLE.exec(block.slice(bs));
  if (title) end = bs + title.index;
  const again = block.indexOf("貸借対照表", bs + 1);
  if (again >= 0 && again < end && block.slice(bs, again).includes("合計")) end = block.lastIndexOf("\n", again) + 1;
  return block.slice(0, end);
}

/** 切成一条条决算公告（start 是在去空格以后的文字里的位置，抓取时用来算在第几页）。没有「貸借対照表」的不算。 */
export function splitNotices(text: string, alreadySquashed = false): { start: number; block: string }[] {
  const squashed = alreadySquashed ? text : squashCjk(text);
  const starts = [...squashed.matchAll(HEADER)].map((m) => m.index ?? 0);
  return starts
    .map((start, i) => ({ start, block: ownPart(squashed.slice(start, i + 1 < starts.length ? starts[i + 1] : start + 4000)) }))
    .filter((n) => n.block.includes("貸借対照表"));
}

/**
 * 公司名长了会折成两行：上一行以「・」结尾，或者全是英文；
 * 也会在「株式会社」中间折开（「…株式」+「会社代表取締役…」），这时只补上「会社」两个字。
 */
function companyName(lines: string[]): string | null {
  const i = lines.findIndex((l, k) => COMPANY.test(l) || (SPLIT_SUFFIX.test(l) && (lines[k + 1] ?? "").startsWith("会社")));
  if (i < 0) return null;
  // 代表者挤在同一行（「株式会社代表取締役下川康弘」）：从职务那里切掉
  const line = (COMPANY.test(lines[i]) ? lines[i] : `${lines[i]}会社`).split(REPRESENTATIVE)[0].trim();
  const prev = lines[i - 1] ?? "";
  // 切完只剩「株式会社」：公司名的前半在上一行
  if (/^(株式会社|有限会社|合同会社)$/.test(line) && prev) return prev + line;
  if (prev.endsWith("・")) return prev + line;
  if (/^[A-Za-z][A-Za-z0-9 .,&'-]*$/.test(prev)) return `${prev} ${line}`;
  return line;
}

export function parseNotice(block: string): ParsedNotice {
  const lines = block.split("\n");
  const unitMatch = /単位[：:・]?\s*(千円|百万円|円)|金額\s*[(（](千円|百万円|円)[)）]/.exec(block);
  const unit = (unitMatch ? (unitMatch[1] ?? unitMatch[2]) : null) as KanpoUnit | null;
  const bs = block.slice(block.indexOf("貸借対照表"));
  // 「流動資産合計」「投資その他の資産合計」「純資産合計」都不是资产合计：前面紧挨着汉字或「の」的不算
  let assets = numberAfter("(?<![\\u4e00-\\u9fffの])資産合計", bs) ?? numberAfter("資産の部合計", bs);
  if (assets === null) assets = numberAfter("(?:^|\\n)合計", bs.slice(Math.max(0, bs.indexOf("資産"))));
  const netAssets = numberAfter("(?<![・び債])純資産合計", bs);
  const retained = numberAfter("(?<!その他)利益剰余金", bs);
  // 贷借对照表里的「(うち当期純利益)(N)」（也有写「内」、不写「うち」、写「当期利益」的）优先；没有就取损益计算书的「当期純利益 N」（不取「税引前」那一行，可能在表前面）
  const ni =
    new RegExp("[(（](?:うち|内)?当期純?(利益|損失)(?:金額)?[)）]\\s*[(（]?\\s*" + NUMBER).exec(bs) ??
    new RegExp("(?<!前)当期純(利益|損失)(?:金額)?\\s*[(（]?\\s*" + NUMBER).exec(block);
  let netIncome = ni ? toInt(ni[2], ni[3]) : null;
  if (ni && ni[1] === "損失" && netIncome !== null) netIncome = -Math.abs(netIncome);
  const company = companyName(lines);
  const factor = unit ? UNIT_FACTOR[unit] : null;
  const yen = (v: number | null) => (v === null || factor === null ? null : v * factor);
  return {
    company_name: company,
    address: PREFECTURE.exec(block)?.[0].trim() ?? null,
    period: PERIOD.exec(block)?.[0].replace(/\s/g, "") ?? null,
    fiscal_end: /([^\n()（）]*現在)/.exec(block)?.[1].trim() ?? null,
    unit,
    total_assets: yen(assets),
    net_assets: yen(netAssets),
    retained_earnings: yen(retained),
    net_income: yen(netIncome),
    // 纯资产比资产合计还大是不可能的：多半抽错了一个数，当没抽全，不显示错的数字
    complete: Boolean(company && unit && assets !== null && netIncome !== null && !(netAssets !== null && netAssets > assets)),
    raw_text: block,
  };
}

/** 公司名归一化：全半角统一、去掉株式会社/有限会社/合同会社/(株)、去空格、英文大写。 */
export function companyKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/株式会社|有限会社|合同会社|\(株\)/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** 名单里一家的几种写法 → 匹配用的 key（他点过「不是这家」的去掉）。 */
export function watchKeys(watch: Pick<KanpoWatch, "aliases" | "rejected">): string[] {
  return Array.from(new Set(watch.aliases.map(companyKey).filter((k) => k && !watch.rejected.includes(k))));
}

/** 金额显示：一亿以上写亿円（一百亿以上不带小数），一万以上写万円，其余写円。 */
export function formatYen(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}亿円`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString("ja-JP")}万円`;
  return `${sign}${a.toLocaleString("ja-JP")}円`;
}
