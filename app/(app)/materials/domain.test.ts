import { describe, expect, it } from "vitest";
import {
  MATERIAL_DEPARTMENTS,
  MATERIAL_ROUTE_TARGETS,
  buildMaterialSnapshot,
  parseMaterialDraft,
  parseMaterialReview,
  parseMaterialRoute,
  summarizeSpreadsheetRows,
} from "./domain";

describe("materials domain", () => {
  it("keeps six departments stable and specific to IdeaOS reality", () => {
    expect(MATERIAL_DEPARTMENTS).toEqual([
      "customer",
      "company",
      "market",
      "judgment",
      "action",
      "self",
    ]);
  });

  it("parses a 中书 draft while keeping facts, inferences and unknowns separate", () => {
    const draft = parseMaterialDraft({
      summary: "供应商报价变化影响毛利假设。",
      original_fragments: ["A 供应商说这个价格下不来"],
      confirmed_facts: ["供应商明确拒绝当前降价要求"],
      possible_inferences: ["当前 MVP 毛利可能偏乐观"],
      unknowns: ["是否存在其他供应商报价"],
      affected_objects: [{ type: "idea", id: "idea-1", title: "低价套装" }],
      suggested_departments: ["company", "judgment"],
      suggested_routes: [
        {
          target: "company_kb",
          reason: "涉及供应商与成本事实",
          payload_hint: "保存为公司事实草稿",
        },
      ],
      may_affect_next_step: true,
    });

    expect(draft.confirmed_facts).toEqual(["供应商明确拒绝当前降价要求"]);
    expect(draft.possible_inferences).toEqual(["当前 MVP 毛利可能偏乐观"]);
    expect(draft.suggested_departments).toEqual(["company", "judgment"]);
  });

  it("rejects scoring language and invalid departments", () => {
    const base = {
      summary: "摘要",
      original_fragments: ["x"],
      confirmed_facts: ["x"],
      possible_inferences: [],
      unknowns: ["x"],
      affected_objects: [],
      suggested_departments: ["customer"],
      suggested_routes: [],
      may_affect_next_step: false,
    };
    expect(() =>
      parseMaterialDraft({ ...base, summary: "这个机会成功率 80%。" })
    ).toThrow("forbidden scoring");

    expect(() =>
      parseMaterialDraft({ ...base, suggested_departments: ["archive"] })
    ).toThrow("invalid material department");

  });

  it("drops a route suggestion with an unknown target instead of rejecting the whole draft", () => {
    const draft = parseMaterialDraft({
      summary: "摘要",
      original_fragments: ["x"],
      confirmed_facts: ["x"],
      possible_inferences: [],
      unknowns: [],
      affected_objects: [],
      suggested_departments: ["customer"],
      suggested_routes: [
        { target: "knowledge", reason: "r", payload_hint: "p" },
        { target: "idea", reason: "r", payload_hint: "p" },
      ],
      may_affect_next_step: false,
    });
    expect(draft.suggested_routes.map((r) => r.target)).toEqual(["idea"]);
  });

  it("moves speculative 'facts' into possible_inferences instead of rejecting the whole draft", () => {
    const draft = parseMaterialDraft({
      summary: "摘要",
      original_fragments: ["x"],
      confirmed_facts: ["报价从 100 涨到 130", "可能是成本压力"],
      possible_inferences: ["客户可能会换供应商"],
      unknowns: [],
      affected_objects: [],
      suggested_departments: ["customer"],
      suggested_routes: [],
      may_affect_next_step: false,
    });
    expect(draft.confirmed_facts).toEqual(["报价从 100 涨到 130"]);
    expect(draft.possible_inferences).toEqual(["客户可能会换供应商", "可能是成本压力"]);
  });

  it("parses 门下 review as a guardrail instead of an action plan", () => {
    const review = parseMaterialReview({
      fact_inference_checks: ["成本上升是事实，MVP 不可行只是推断"],
      insufficient_evidence: ["没有销量数据"],
      sensitive_items: [
        { label: "供应商名", handling: "redact", reason: "商业机密" },
      ],
      misleading_risks: ["可能把单一报价当成市场价格"],
      blocked_auto_writes: ["不能自动写入公司事实"],
      should_not_route: false,
      review_summary: "需要用户确认供应商名与金额处理方式。",
    });

    expect(review.sensitive_items[0].handling).toBe("redact");
    expect(review.blocked_auto_writes).toContain("不能自动写入公司事实");
  });

  it("accepts only explicit route targets and creates immutable snapshots", () => {
    expect(MATERIAL_ROUTE_TARGETS).toContain("decision_closure");

    const route = parseMaterialRoute({
      target: "reality",
      target_id: "case-1",
      departments: ["judgment", "action"],
      reason: "影响当前现状地图",
      snapshot: { summary: "材料摘要" },
    });
    expect(route.target).toBe("reality");
    expect(() =>
      parseMaterialRoute({
        target: "auto_create_idea",
        departments: ["judgment"],
        reason: "x",
        snapshot: {},
      })
    ).toThrow("invalid route target");

    const snapshot = buildMaterialSnapshot({
      materialId: "mat-1",
      title: "报价变化",
      sourceType: "text",
      sanitizedText: "A 供应商说价格下不来",
      extraction: { extractedText: "A 供应商说价格下不来" },
      draft: { summary: "报价变化" },
      review: { review_summary: "需要确认" },
    });
    expect(snapshot.material_id).toBe("mat-1");
    expect(snapshot.ai_outputs_are_drafts).toBe(true);
  });

  it("summarizes spreadsheet rows without hidden sheets or unbounded content", () => {
    const summary = summarizeSpreadsheetRows(
      [
        {
          name: "可见表",
          state: "visible",
          rows: [
            ["月份", "广告费", "毛利"],
            ["7月", "100000", "35%"],
          ],
        },
        {
          name: "隐藏表",
          state: "hidden",
          rows: [["secret"]],
        },
      ],
      200
    );

    expect(summary.visible_sheet_names).toEqual(["可见表"]);
    expect(summary.hidden_sheet_count).toBe(1);
    expect(summary.text).toContain("可见表");
    expect(summary.text).not.toContain("secret");
  });
});

describe("分享进来的网址", () => {
  it("从带标题的分享文字里挑出网址", async () => {
    const { pickUrl } = await import("./ingest");
    expect(pickUrl("年俸2800万円でも争奪戦 https://www.itmedia.co.jp/a/b.html")).toBe("https://www.itmedia.co.jp/a/b.html");
    expect(pickUrl("没有网址的一段话")).toBeNull();
    // ingest 连带加载数据库和 AI 模块，全量并行跑时偶尔超过默认的 5 秒
  }, 20_000);

  it("内网、本机、元数据地址算内网", async () => {
    const { isPrivateAddress } = await import("./fetch-page");
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.200", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});
