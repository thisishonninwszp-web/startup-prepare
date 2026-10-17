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
