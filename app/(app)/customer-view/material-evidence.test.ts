import { beforeEach, describe, expect, it, vi } from "vitest";

// 用户自己贴进来的材料（访谈、聊天、评论）保存后要提取证据，
// 否则「区分顾客声音」和模式报告只读到网上的材料。
// 这里用一个内存里的假 Supabase，从保存一路走到区分顾客声音。

type Row = Record<string, unknown>;

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  extract: vi.fn(),
  segment: vi.fn(),
  search: vi.fn(),
  translate: vi.fn(),
  plan: vi.fn(),
  db: {} as Record<string, Record<string, unknown>[]>,
  nextId: 0,
}));

function table(name: string) {
  return (m.db[name] ??= []);
}

function query(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: "select" | "insert" | "upsert" | "update" = "select";
  let payload: Row[] = [];
  let patch: Row = {};
  let conflict: string[] = [];
  let limit: number | undefined;

  const run = (): Row[] => {
    const rows = table(name);
    if (mode === "insert" || mode === "upsert") {
      return payload.map((input) => {
        const existing =
          mode === "upsert"
            ? rows.find((row) => conflict.every((key) => row[key] === input[key]))
            : undefined;
        if (existing) return Object.assign(existing, input);
        const row = { id: `${name}-${++m.nextId}`, ...input };
        rows.push(row);
        return row;
      });
    }
    const matched = rows.filter((row) => filters.every((filter) => filter(row)));
    if (mode === "update") return matched.map((row) => Object.assign(row, patch));
    const limited = limit === undefined ? matched : matched.slice(0, limit);
    if (name !== "customer_case_materials") return limited;
    return limited.map((row) => ({
      ...row,
      customer_materials: table("customer_materials").find(
        (material) => material.id === row.material_id
      ),
    }));
  };

  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => {
      filters.push((row) => row[key] === value);
      return builder;
    },
    in: (key: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[key]));
      return builder;
    },
    limit: (count: number) => {
      limit = count;
      return builder;
    },
    insert: (rows: Row | Row[]) => {
      mode = "insert";
      payload = [rows].flat();
      return builder;
    },
    upsert: (row: Row, options: { onConflict: string }) => {
      mode = "upsert";
      payload = [row];
      conflict = options.onConflict.split(",");
      return builder;
    },
    update: (values: Row) => {
      mode = "update";
      patch = values;
      return builder;
    },
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve({ data: run(), error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: m.auth } }),
}));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: query } }));
vi.mock("@/lib/external", () => ({ tavilyExtract: vi.fn() }));
vi.mock("@/lib/web-search", () => ({ webSearch: m.search }));
vi.mock("@/lib/ai", () => ({
  answerAsCustomerProxy: vi.fn(),
  buildCustomerProxy: vi.fn(),
  compareCustomerProxyVersions: vi.fn(),
  extractCustomerEvidence: m.extract,
  generateCustomerOpportunities: vi.fn(),
  generateCustomerPatternReport: vi.fn(),
  planCustomerSearch: m.plan,
  reactToIdeaAsCustomer: vi.fn(),
  segmentCustomerVoices: m.segment,
  translateQuery: m.translate,
}));

import { AiGatewayError } from "@/lib/ai-gateway";
import {
  addCustomerMaterial,
  retryCustomerMaterialEvidence,
  runCustomerResearch,
  searchCustomerMaterials,
} from "./actions";

const interview = {
  origin: "interview" as const,
  title: "店长访谈",
  text: "每天关店后还要对两个小时的账，Excel 一张张对，烦死了。电话 090-1234-5678",
  confirmed: true,
};

const chat = {
  origin: "chat" as const,
  title: "群聊记录",
  text: "我们现在请兼职帮忙对账，一个月多花三万日元，但总比自己熬夜强。",
  confirmed: true,
};

function atomFor(materialId: string, quote: string) {
  return {
    material_id: materialId,
    quote,
    scene: "关店后对账",
    behavior: "手工核对表格",
    alternative: "Excel",
    tradeoff: "省钱但耗时间",
    emotion: "烦躁",
    emotion_basis: "stated" as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.db = {
    customer_cases: [
      {
        id: "case",
        user_id: "owner",
        idea_id: null,
        title: "小店对账",
        customer_hypothesis: "个人经营的小店店长",
        problem_context: "每天关店后对账",
        markets: ["jp"],
        original_belief: "店长愿意为对账软件付钱",
        archived_at: null,
      },
    ],
  };
  m.nextId = 0;
  m.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  m.extract.mockImplementation(
    async (materials: { id: string; text: string }[]) => [
      atomFor(materials[0].id, materials[0].text.slice(0, 20)),
    ]
  );
  m.segment.mockResolvedValue({ segments: [] });
  m.translate.mockResolvedValue({
    zh: "小店 对账",
    ja: "個人店 レジ締め",
    en: "small shop bookkeeping",
  });
  m.search.mockResolvedValue([]);
  m.plan.mockResolvedValue({
    jp: { topic: "飲食店", queries: ["飲食店 レジ締め 時間", "飲食店 売上 集計"] },
  });
});

function page(url: string, title = "飲食店のレジ締めが毎日つらい") {
  return { url, title, content: "毎日レジ締めに30分かかって、正直しんどいです。" };
}

const VOICE_SITES = {
  domains: ["detail.chiebukuro.yahoo.co.jp", "girlschannel.net"],
};

describe("searching public materials", () => {
  it("searches with everyday queries where people talk about their own experience", async () => {
    m.search
      .mockResolvedValueOnce([
        page("https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1"),
        page("https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q2"),
      ])
      .mockResolvedValueOnce([page("https://girlschannel.net/topics/3/")]);

    const result = await searchCustomerMaterials("case");

    expect(m.plan).toHaveBeenCalledWith({
      hypothesis: "个人经营的小店店长",
      context: "每天关店后对账",
      markets: ["jp"],
    });
    expect(m.translate).not.toHaveBeenCalled();
    expect(m.search).toHaveBeenCalledWith("飲食店 レジ締め 時間", 8, VOICE_SITES);
    expect(m.search).toHaveBeenCalledWith("飲食店 売上 集計", 8, VOICE_SITES);
    expect(result).toEqual({ inserted: 3, errors: [] });
    expect(
      table("customer_case_materials").map((link) => link.status)
    ).toEqual(["candidate", "candidate", "candidate"]);
  });

  it("falls back to translating the case when the AI can't write queries", async () => {
    m.plan.mockRejectedValueOnce(new Error("搜索计划没有一个市场写对"));
    m.search.mockResolvedValueOnce([
      page("https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1", "q1"),
      page("https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q2", "q2"),
      page("https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q3", "q3"),
    ]);

    const result = await searchCustomerMaterials("case");

    expect(m.translate).toHaveBeenCalledWith("个人经营的小店店长 每天关店后对账");
    expect(m.search).toHaveBeenCalledWith("個人店 レジ締め", 8, VOICE_SITES);
    expect(result.inserted).toBe(3);
  });
});

describe("pasted customer materials", () => {
  it("extracts evidence right after saving, so it reaches customer-voice research", async () => {
    const first = await addCustomerMaterial("case", interview);
    const second = await addCustomerMaterial("case", chat);

    expect(first).toEqual({
      materialId: expect.any(String),
      evidenceCount: 1,
      evidenceError: null,
    });
    expect(second.evidenceCount).toBe(1);
    // 发给 AI 的是遮蔽后的版本
    expect(m.extract.mock.calls[0][0][0].text).not.toContain("090-1234-5678");
    expect(
      table("customer_case_materials").map((link) => [link.material_id, link.status])
    ).toEqual([
      [first.materialId, "kept"],
      [second.materialId, "kept"],
    ]);

    await runCustomerResearch("case");

    const researched = m.segment.mock.calls[0][0] as { material_id: string }[];
    expect(researched.map((atom) => atom.material_id).sort()).toEqual(
      [first.materialId, second.materialId].sort()
    );
    // 区分顾客声音时带上课题：只用这类人、这件事的证据
    expect(m.segment.mock.calls[0][1]).toEqual({
      hypothesis: "个人经营的小店店长",
      context: "每天关店后对账",
    });
    expect(table("customer_research_runs")[0]).toMatchObject({
      case_id: "case",
      prompt_version: "customer-research-v2",
    });
  });

  it("does not extract again when the same material is saved twice", async () => {
    const first = await addCustomerMaterial("case", interview);
    const again = await addCustomerMaterial("case", interview);

    expect(again.materialId).toBe(first.materialId);
    expect(again.evidenceCount).toBe(1);
    expect(m.extract).toHaveBeenCalledTimes(1);
    expect(table("customer_evidence_atoms")).toHaveLength(1);
  });

  it("keeps the material when extraction fails, and the retry fills in the evidence", async () => {
    m.extract.mockRejectedValueOnce(
      new AiGatewayError({ code: "timeout", requestId: "req-1" })
    );

    const saved = await addCustomerMaterial("case", interview);

    expect(saved.evidenceCount).toBeNull();
    expect(saved.evidenceError).toBe("AI 响应超时，本次输入已保留。");
    expect(table("customer_materials")).toHaveLength(1);
    expect(table("customer_case_materials")[0]).toMatchObject({
      material_id: saved.materialId,
      status: "kept",
    });
    expect(table("customer_evidence_atoms") ?? []).toHaveLength(0);

    await expect(
      retryCustomerMaterialEvidence("case", saved.materialId)
    ).resolves.toBe(1);
    expect(table("customer_evidence_atoms")[0]).toMatchObject({
      user_id: "owner",
      material_id: saved.materialId,
    });
  });

  it("only retries extraction for materials kept in this case", async () => {
    const saved = await addCustomerMaterial("case", interview);
    table("customer_case_materials")[0].status = "excluded";

    await expect(
      retryCustomerMaterialEvidence("case", saved.materialId)
    ).rejects.toThrow("只有已保留的材料");
  });
});
