import { describe, expect, it } from "vitest";
import {
  isProvisionalProxy,
  customerVoiceSearch,
  filterEvidenceForSegment,
  keepCustomerWords,
  quoteInMaterial,
  nextCustomerRun,
  parseCustomerEvidenceBatch,
  parseCustomerOpportunities,
  parseCustomerProxyAnswer,
  parseCustomerSegments,
  validateCustomerCitations,
} from "./types";

describe("customer evidence", () => {
  it("accepts only stated, inferred, or unknown emotion evidence", () => {
    const batch = parseCustomerEvidenceBatch({
      atoms: [
        {
          material_id: "m1",
          quote: "每天对账到凌晨，真的很烦。",
          scene: "月末对账",
          behavior: "手工核对多个表格",
          alternative: "继续使用Excel",
          tradeoff: "省软件费但耗时间",
          emotion: "烦躁",
          emotion_basis: "stated",
        },
      ],
    });
    expect(batch.atoms[0].emotion_basis).toBe("stated");
    expect(() =>
      parseCustomerEvidenceBatch({
        atoms: [
          {
            material_id: "m1",
            quote: "内容",
            scene: "场景",
            behavior: "行为",
            alternative: "替代",
            tradeoff: "取舍",
            emotion: "高兴",
            emotion_basis: "certain",
          },
        ],
      })
    ).toThrow("emotion_basis");
  });

  it("reads who said the line, ignoring values it does not know", () => {
    const atom = {
      material_id: "m1",
      quote: "每天对账到凌晨，真的很烦。",
      scene: "",
      behavior: "",
      alternative: "",
      tradeoff: "",
      emotion: "",
      emotion_basis: "stated",
    };
    const batch = parseCustomerEvidenceBatch({
      atoms: [
        { ...atom, speaker: "seller" },
        { ...atom, speaker: "顾客" },
        atom,
      ],
    });
    expect(batch.atoms.map((item) => item.speaker)).toEqual([
      "seller",
      undefined,
      undefined,
    ]);
  });

  it("reads what each page is, and treats blank fields written as null as empty", () => {
    const batch = parseCustomerEvidenceBatch({
      pages: [
        { material_id: "m1", kind: "seller" },
        { material_id: "m2", kind: "店铺" },
        "m3",
      ],
      atoms: [
        {
          material_id: "m1",
          quote: "初めての利用でしたが満足しています。",
          scene: null,
          behavior: null,
          tradeoff: null,
          emotion: null,
          emotion_basis: "stated",
        },
      ],
    });
    expect(batch.pages).toEqual([{ material_id: "m1", kind: "seller" }]);
    expect(batch.atoms[0]).toMatchObject({
      scene: "",
      behavior: "",
      alternative: "",
      tradeoff: "",
      emotion: "",
    });
    expect(parseCustomerEvidenceBatch({ atoms: [] })).not.toHaveProperty("pages");
    expect(() =>
      parseCustomerEvidenceBatch({
        atoms: [{ material_id: "m1", quote: null, emotion_basis: "stated" }],
      })
    ).toThrow("quote");
  });

  it("marks fewer than three independent kept materials as provisional", () => {
    expect(isProvisionalProxy(["m1", "m2"])).toBe(true);
    expect(isProvisionalProxy(["m1", "m2", "m3"])).toBe(false);
    expect(isProvisionalProxy(["m1", "m1", "m2", "m3"])).toBe(false);
  });
});

describe("only the customer's own words count as evidence", () => {
  const text = new Map([
    [
      "interview",
      "店长说：每天关店后还要对两个小时的账，Excel 一张张对，烦死了。\n后来请了兼职，一个月多花三万日元。",
    ],
    [
      "vendor",
      "「洗濯物の受け取り、もう悩まない」宅配クリーニングなら、24時間いつでも玄関先で受け取れます。お客様の声：本当に楽になりました！",
    ],
  ]);
  const atom = (material_id: string, quote: string, speaker?: string) => ({
    material_id,
    quote,
    scene: "",
    behavior: "",
    alternative: "",
    tradeoff: "",
    emotion: "",
    emotion_basis: "stated" as const,
    ...(speaker ? { speaker: speaker as "customer" | "seller" | "other" } : {}),
  });

  it("drops what the seller or a bystander said", () => {
    const kept = keepCustomerWords(
      {
        atoms: [
          atom("interview", "Excel 一张张对，烦死了", "customer"),
          atom("vendor", "24時間いつでも玄関先で受け取れます", "seller"),
          atom("vendor", "本当に楽になりました！", "seller"),
          atom("interview", "后来请了兼职", "other"),
        ],
      },
      text
    );
    expect(kept.map((item) => item.quote)).toEqual(["Excel 一张张对，烦死了"]);
    expect(kept[0]).not.toHaveProperty("speaker");
  });

  it("keeps nothing from the seller's own page, even testimonials that look like a customer talking", () => {
    const kept = keepCustomerWords(
      {
        pages: [
          { material_id: "vendor", kind: "seller" },
          { material_id: "interview", kind: "community" },
        ],
        atoms: [
          atom("vendor", "本当に楽になりました！", "customer"),
          atom("interview", "Excel 一张张对，烦死了", "customer"),
        ],
      },
      text
    );
    expect(kept.map((item) => item.material_id)).toEqual(["interview"]);
  });

  it("drops quotes that are not word for word in the material", () => {
    const kept = keepCustomerWords(
      { atoms: [
        // 改写
        atom("interview", "每天关店后要花两小时对账，很烦", "customer"),
        // 用省略号拼起来
        atom("interview", "每天关店后……烦死了", "customer"),
        // 翻译成别的语言
        atom("vendor", "真的轻松多了", "customer"),
        // 不是这份材料的
        atom("vendor", "Excel 一张张对，烦死了", "customer"),
        // 太短，到处都能对上
        atom("interview", "烦死了", "customer"),
        // 没有这份材料
        atom("missing", "Excel 一张张对，烦死了", "customer"),
      ] },
      text
    );
    expect(kept).toEqual([]);
  });

  it("ignores spacing and full-width differences, and keeps lines with no speaker", () => {
    const kept = keepCustomerWords(
      { atoms: [atom("interview", "Ｅｘｃｅｌ一张张对， 烦死了")] },
      text
    );
    expect(kept).toHaveLength(1);
    expect(quoteInMaterial("一个月多花三万日元", text.get("interview")!)).toBe(true);
  });
});

describe("where to search for customer materials", () => {
  it("searches Q&A and forum sites for Japanese and Chinese, and adds experience words for English", () => {
    expect(customerVoiceSearch("jp", "レジ締め")).toEqual({
      query: "レジ締め",
      domains: ["detail.chiebukuro.yahoo.co.jp", "girlschannel.net"],
    });
    expect(customerVoiceSearch("cn", "对账")).toEqual({
      query: "对账",
      domains: ["douban.com", "v2ex.com"],
    });
    expect(customerVoiceSearch("en", "bookkeeping")).toEqual({
      query: "bookkeeping my experience forum",
    });
  });
});

describe("customer segmentation", () => {
  it("requires two or three behavioral customer voices", () => {
    expect(
      parseCustomerSegments({
        segments: [
          {
            key: "manual-reconciler",
            label: "继续手工对账的人",
            situation: "月末集中核账",
            behaviors: ["复制多个表格"],
            evidence_ids: ["e1"],
            unknowns: ["是否有采购权"],
          },
          {
            key: "outsourcer",
            label: "把对账交给代账的人",
            situation: "内部没有财务人员",
            behaviors: ["把资料发送给代账"],
            evidence_ids: ["e2"],
            unknowns: ["服务成本"],
          },
        ],
      }).segments
    ).toHaveLength(2);

    expect(() => parseCustomerSegments({ segments: [] })).toThrow("segments");
  });

  it("keeps a proxy inside the selected segment evidence boundary", () => {
    const atoms = [
      { id: "e1", material_id: "m1" },
      { id: "e2", material_id: "m2" },
    ] as Parameters<typeof filterEvidenceForSegment>[0];
    const segment = {
      key: "one",
      label: "第一类",
      situation: "场景",
      behaviors: ["行为"],
      evidence_ids: ["e1"],
      unknowns: [],
    };
    expect(filterEvidenceForSegment(atoms, segment).map((atom) => atom.id)).toEqual([
      "e1",
    ]);
  });
});

describe("grounded proxy answers", () => {
  it("rejects citations outside the allowed evidence set", () => {
    const answer = parseCustomerProxyAnswer({
      answer: "我不会马上换工具。",
      evidence_ids: ["e-forged"],
      inference: "可能担心迁移成本。",
      unknowns: ["是否愿意试用"],
    });
    expect(() => validateCustomerCitations(answer.evidence_ids, ["e1"])).toThrow(
      "未被允许"
    );
  });
});

describe("customer opportunity generation", () => {
  const opportunity = {
    customer_progress: "更快完成月末对账",
    current_alternative: "Excel与人工检查",
    direction: "减少跨表核对步骤",
    evidence_ids: ["e1"],
    evidence_gaps: ["是否愿意迁移"],
    fatal_assumption: "顾客愿意改变现有流程",
  };

  it("allows at most three unranked opportunities", () => {
    expect(
      parseCustomerOpportunities({
        opportunities: [opportunity, opportunity, opportunity],
      }).opportunities
    ).toHaveLength(3);
    expect(() =>
      parseCustomerOpportunities({
        opportunities: [
          opportunity,
          opportunity,
          opportunity,
          opportunity,
        ],
      })
    ).toThrow("最多3条");
  });
});

describe("customer research schedules", () => {
  it("calculates daily and weekly next runs", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(nextCustomerRun("daily", from).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z"
    );
    expect(nextCustomerRun("weekly", from).toISOString()).toBe(
      "2026-01-08T00:00:00.000Z"
    );
  });
});
