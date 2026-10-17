import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { companyKey, formatYen, parseNotice, splitNotices, watchKeys } from "./kanpo-shared";

const FIXTURE = readFileSync(fileURLToPath(new URL("./__fixtures__/kanpo-20261016-p80-83.txt", import.meta.url)), "utf8");
const parsed = splitNotices(FIXTURE).map((b) => parseNotice(b.block));
const byName = (name: string) => parsed.find((p) => p.company_name === name);

describe("切条", () => {
  it("10 月 16 日第 80–83 页切出 13 条决算公告（包括竖排那条）", () => {
    expect(parsed).toHaveLength(13);
  });

  it("13 条的四样都抽到", () => {
    expect(parsed.filter((p) => !p.complete).map((p) => p.company_name)).toEqual([]);
  });

  it("「令和７年度決算公告」「2026年３月期決算公告」这样的标题也切得开", () => {
    const text = [
      "令和７年度決算公告",
      "株式会社イチ",
      "貸借対照表の要旨 (単位：千円)",
      "資産合計 100",
      "(うち当期純利益) (10)",
      "2026年３月期決算公告",
      "株式会社ニ",
      "貸借対照表の要旨 (単位：千円)",
      "資産合計 200",
      "(うち当期純利益) (20)",
    ].join("\n");
    expect(splitNotices(text).map((b) => parseNotice(b.block).company_name)).toEqual(["株式会社イチ", "株式会社ニ"]);
  });

  it("后面跟着合併公告时，不拿合併公告里「最終貸借対照表」的数字（7 月 21 日高岡ケーブルネットワーク）", () => {
    const text = [
      "第37期決算公告",
      "高岡ケーブルネットワーク株式会社",
      "貸借対照表の要旨(令和８年３月31日現在)(単位：百万円)",
      "資産合計 5,597 負債・純資産合計 5,597",
      "損益計算書の要旨",
      "当期純利益 480",
      "合併公告",
      "左記会社は合併することにいたしました。",
      "なお、最終貸借対照表の要旨は左記のとおりです。",
      "(うち当期純利益) (36,750)",
    ].join("\n");
    const [block] = splitNotices(text);
    expect(parseNotice(block.block)).toMatchObject({ total_assets: 5_597_000_000, net_income: 480_000_000 });
    expect(block.block).not.toContain("合併公告");
  });

  it("别家的贷借对照表接在后面、它的标题落在别处时，只读自己那张（9 月 24 日Ｋ・ＧＲＡＤ）", () => {
    const text = [
      "第11期決算公告",
      "株式会社Ｋ・ＧＲＡＤ",
      "貸借対照表の要旨",
      "(令和７年12月31日現在) (単位：円)",
      "資産",
      "の部",
      "流動資産 415,687,263",
      "合計 781,819,391",
      "(うち当期純利益) (68,401,724)",
      "合計 781,819,391",
      "貸借対照表の要旨(2026年５月31日現在)",
      "科目金額(千円)",
      "資産合計 7,146",
      "(うち当期純損失) (3,849)",
    ].join("\n");
    expect(parseNotice(splitNotices(text)[0].block)).toMatchObject({ total_assets: 781_819_391, net_income: 68_401_724 });
  });
});

describe("抽字段", () => {
  it("横排、資産合計：菊池食品工业", () => {
    expect(byName("菊池食品工業株式会社")).toMatchObject({
      period: "第81期",
      fiscal_end: "令和８年６月30日現在",
      unit: "千円",
      total_assets: 4_610_959_000,
      net_assets: 1_805_105_000,
      retained_earnings: 1_766_015_000,
      net_income: 19_973_000,
    });
    expect(byName("菊池食品工業株式会社")?.address).toMatch(/^東京都板橋区/);
  });

  it("「合計」当资产合计、负号是私用区字符 U+E888：さくらPORT・TOWN", () => {
    expect(byName("さくらＰＯＲＴ・ＴＯＷＮ株式会社")).toMatchObject({
      total_assets: 4_476_065_000,
      retained_earnings: -221_950_000,
      net_income: -17_483_000,
    });
  });

  it("竖排：汉字数字、「資産の部合計」、负号 U+E6F0、公司名在表后面", () => {
    expect(byName("株式会社創友建設")).toMatchObject({
      period: "第二期",
      fiscal_end: "令和八年七月三十一日現在",
      unit: "千円",
      total_assets: 40_852_000,
      retained_earnings: -3_659_000,
      net_income: -31_000,
    });
  });

  it("单位百万円；公司名折行（上一行以「・」结尾）", () => {
    expect(byName("カーティス・インスツルメンツ・パシフィック株式会社")).toMatchObject({
      unit: "百万円",
      total_assets: 448_000_000,
      net_income: 1_000_000,
    });
  });

  it("公司名折行（上一行全是英文）；英文名里的空格留着", () => {
    expect(byName("Ericsson Enterprise Wireless Solutions Japan株式会社")?.net_income).toBe(4_469_000);
    expect(byName("Mott MacDonald Japan株式会社")?.retained_earnings).toBe(-92_206_000);
  });

  it("「株式会社」被折行拆开（「…株式」+「会社代表取締役…」）也认得公司名（10 月 16 日真跑时碰到）", () => {
    const block = [
      "第４期決算公告",
      "令和８年９月30日",
      "富山県富山市中島４２14",
      "オンリーワンライフホールディングス株式",
      "会社代表取締役奥野智之",
      "貸借対照表の要旨",
      "(令和８年６月30日現在) (単位：千円)",
      "資産合計 2,013,210",
      "(うち当期純利益) (19,742)",
    ].join("\n");
    expect(parseNotice(block)).toMatchObject({ company_name: "オンリーワンライフホールディングス株式会社", complete: true });
  });

  it("损益计算书写法「当期純利益 31,948」（没有「うち」、在贷借对照表前面）也认；不拿「税引前」那一行（10 月 16 日 iTunes）", () => {
    const block = [
      "第22期決算公告",
      "東京都港区六本木六丁目10番１号六本木ヒルズ",
      "ⅰＴｕｎｅｓ株式会社",
      "損益計算書の要旨",
      "(単位：百万円)",
      "税引前当期純利益 45,215",
      "当期純利益 31,948",
      "貸借対照表の要旨",
      "(令和８年６月30日現在) (単位：百万円)",
      "負債合計 503,695",
      "純資産合計 32,073",
      "資産合計 535,768 負債・純資産合計 535,768",
    ].join("\n");
    expect(parseNotice(block)).toMatchObject({ net_income: 31_948_000_000, total_assets: 535_768_000_000, complete: true });
    const loss = block.replace("税引前当期純利益 45,215", "税引前当期純損失 603").replace("当期純利益 31,948", "当期純損失 654");
    expect(parseNotice(loss).net_income).toBe(-654_000_000);
  });

  it("千位分隔是私用区字符（U+EA75）也认；不把地址里数字之间的私用区横杠当分隔（10 月 16 日聖ルチア会）", () => {
    const block = [
      "第74期決算公告",
      "福岡県久留米市津福本町1628",
      "株式会社テスト",
      "貸借対照表の要旨 (令和８年３月31日現在) (単位：千円)",
      "純資産合計 6769314",
      "資産合計 7151886",
      "当期純利益 183794",
    ].join("\n");
    expect(parseNotice(block)).toMatchObject({ total_assets: 7_151_886_000, net_assets: 6_769_314_000, net_income: 183_794_000, complete: true });
  });

  it("纯资产合计比资产合计还大（不可能）就当没抽全，不显示错的数字", () => {
    const block = ["第1期決算公告", "株式会社テスト", "貸借対照表の要旨 (単位：千円)", "純資産合計 6,000", "資産合計 7", "(うち当期純利益) (100)"].join("\n");
    expect(parseNotice(block).complete).toBe(false);
  });

  it("「株式会社」和代表者挤在下一行（「シモカワソリューションシステムズ」+「株式会社代表取締役下川康弘」）（10 月 16 日）", () => {
    const block = [
      "第４期決算公告令和８年10月16日",
      "福岡県飯塚市若菜256番地105",
      "シモカワソリューションシステムズ",
      "株式会社代表取締役下川康弘",
      "貸借対照表の要旨(令和８年５月31日現在)",
    ].join("\n");
    expect(parseNotice(block).company_name).toBe("シモカワソリューションシステムズ株式会社");
  });

  it("一般社団法人、特定目的会社这类也认得名字", () => {
    const block = ["第４期決算公告", "富山県富山市中島４２14", "一般社団法人恩の集", "代表理事奥野智之", "貸借対照表の要旨"].join("\n");
    expect(parseNotice(block).company_name).toBe("一般社団法人恩の集");
  });

  it("「(当期純利益) (518,714)」不写「うち」也认（7 月ニッカディスティラリーサービス）", () => {
    const block = ["第1期決算公告", "株式会社テスト", "貸借対照表の要旨 (単位：千円)", "(当期純利益) (518,714)", "資産合計 1,961,750"].join("\n");
    expect(parseNotice(block)).toMatchObject({ net_income: 518_714_000, complete: true });
  });

  it("「(内当期純利益)」「(当期利益)」这样写也认（デュプロ、加地和組）", () => {
    const make = (label: string) =>
      parseNotice(["第1期決算公告", "株式会社テスト", "貸借対照表の要旨 (単位：千円)", `${label} (39,217)`, "資産合計 100,000"].join("\n"));
    expect(make("(内当期純利益)").net_income).toBe(39_217_000);
    expect(make("(当期利益)").net_income).toBe(39_217_000);
  });

  it("「流動資産合計」「投資その他の資産合計」不当资产合计", () => {
    const block = [
      "第1期決算公告",
      "株式会社テスト",
      "貸借対照表の要旨 (単位：千円)",
      "資産",
      "の部",
      "流動資産合計 70",
      "投資その他の資産合計 5",
      "合計 100",
      "(うち当期純利益) (1)",
    ].join("\n");
    expect(parseNotice(block).total_assets).toBe(100_000);
  });

  it("「負債・純資産合計」不当纯资产合计", () => {
    expect(byName("株式会社ＸＡＩＯＮＤＡＴＡ")).toMatchObject({ net_assets: null, total_assets: 384_290_000 });
  });

  it("抽到的资产合计和当期纯损益，原单位下的数字都在原文里", () => {
    const factor = { 円: 1, 千円: 1000, 百万円: 1_000_000 } as const;
    for (const p of parsed.filter((x) => x.period !== "第二期")) {
      const raw = p.raw_text.replace(/\s/g, "");
      for (const v of [p.total_assets, p.net_income]) {
        if (v === null || p.unit === null) continue;
        expect(raw).toContain((Math.abs(v) / factor[p.unit]).toLocaleString("en-US"));
      }
    }
  });
});

describe("公司名归一化与名单", () => {
  it("株式会社的前后、（株）、全角半角、空格都归成同一个", () => {
    const key = companyKey("株式会社譚仔日本");
    expect(companyKey("譚仔日本株式会社")).toBe(key);
    expect(companyKey("（株）譚仔日本")).toBe(key);
    expect(companyKey("株式会社 譚仔日本")).toBe(key);
    expect(companyKey("mott macdonald japan株式会社")).toBe(companyKey("Mott MacDonald Japan株式会社"));
  });

  it("名单的写法归一化，解除过的不算", () => {
    const keys = watchKeys({ aliases: ["株式会社譚仔日本", "譚仔ジャパン株式会社"], rejected: [companyKey("譚仔ジャパン株式会社")] });
    expect(keys).toEqual([companyKey("株式会社譚仔日本")]);
  });
});

describe("金额显示", () => {
  it("亿円、万円、円，负数带减号", () => {
    expect(formatYen(4_610_959_000)).toBe("46.1亿円");
    expect(formatYen(11_497_503_000)).toBe("115亿円");
    expect(formatYen(19_973_000)).toBe("1,997万円");
    expect(formatYen(-31_000)).toBe("−3万円");
    expect(formatYen(1_000_000)).toBe("100万円");
    expect(formatYen(500)).toBe("500円");
  });
});
