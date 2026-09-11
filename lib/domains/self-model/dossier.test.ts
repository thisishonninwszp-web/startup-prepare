import { describe, expect, it } from "vitest";
import {
  MIN_LABEL_EVIDENCE,
  buildDossier,
  emptiness,
  fromDeed,
  fromHypothesis,
  fromPrediction,
  fromWindow,
  type DossierEvidence,
} from "./dossier";
import type { Deed } from "./deeds";

function evidence(over: Partial<DossierEvidence> = {}): DossierEvidence {
  return {
    key: Math.random().toString(36).slice(2),
    source: "prediction",
    sourceId: "x",
    occurredOn: "2026-01-01",
    claim: "说了会怎样",
    side: "kept",
    subject: "交付",
    context: null,
    ...over,
  };
}

function deed(over: Partial<Deed> = {}): Deed {
  return {
    id: Math.random().toString(36).slice(2),
    occurredOn: "2026-01-01",
    title: "一个自发项目",
    classKey: "自发项目",
    outcome: "done",
    adopted: null,
    durationDays: null,
    cost: null,
    ...over,
  };
}

describe("取证：只收有结果的", () => {
  it("没对账的预测不进档案", () => {
    expect(
      fromPrediction({
        id: "p1",
        text: "三个月内有人愿意付钱",
        outcome: "pending",
        due_at: "2026-03-01",
        resolved_at: null,
      })
    ).toBeNull();
  });

  it("命中的预测算兑现，落空的算欠着", () => {
    const hit = fromPrediction({
      id: "p1",
      text: "会有人付钱",
      outcome: "hit",
      due_at: "2026-03-01",
      resolved_at: "2026-03-02",
    });
    const miss = fromPrediction({
      id: "p2",
      text: "会有人付钱",
      outcome: "miss",
      due_at: "2026-03-01",
      resolved_at: "2026-03-02",
    });
    expect(hit?.side).toBe("kept");
    expect(miss?.side).toBe("unkept");
  });

  it("还在做的事不进档案，悬着的事说明不了你是谁", () => {
    expect(fromDeed(deed({ outcome: "ongoing", adopted: null }))).toHaveLength(0);
  });

  it("做完了和有人要，是两条独立证据", () => {
    const out = fromDeed(deed({ outcome: "done", adopted: false }));
    expect(out).toHaveLength(2);
    expect(out.find((item) => item.source === "deed")?.side).toBe("kept");
    expect(out.find((item) => item.source === "adoption")?.side).toBe("unkept");
  });

  it("窗口里没发生行为的那次记为欠着", () => {
    const out = fromWindow({
      id: "w1",
      occurred_on: "2026-02-02",
      context_key: "要开口求人的场合",
      outcome: "miss",
      grade: "E2",
      hypothesis_label: "一需要求人就自己硬扛",
    });
    expect(out.side).toBe("unkept");
    expect(out.context).toBe("要开口求人的场合");
  });

  it("只有被推翻的假设进档案，还立着的不进", () => {
    expect(
      fromHypothesis({ id: "h1", label: "我扛得住", tier: "working" })
    ).toBeNull();
    expect(
      fromHypothesis({ id: "h1", label: "我扛得住", tier: "refuted" })?.side
    ).toBe("unkept");
  });
});

describe("成档", () => {
  it("证据不够只算苗头，不给标签", () => {
    const dossier = buildDossier([
      evidence({ subject: "交付", side: "kept" }),
      evidence({ subject: "交付", side: "kept" }),
    ]);
    expect(MIN_LABEL_EVIDENCE).toBeGreaterThan(2);
    expect(dossier.kept[0].strength).toBe("lead");
    expect(dossier.kept[0].falsifier).toContain("还不够算一条");
  });

  it("够了才成标签，并且自带推翻条件", () => {
    const dossier = buildDossier(
      Array.from({ length: MIN_LABEL_EVIDENCE }, () =>
        evidence({ subject: "交付", side: "kept" })
      )
    );
    expect(dossier.kept[0].strength).toBe("label");
    expect(dossier.kept[0].falsifier).toContain("这条就不成立了");
  });

  it("标签名永远是空的，代码不起名字", () => {
    const dossier = buildDossier([evidence()]);
    expect(dossier.kept[0].name).toBeNull();
  });

  it("同一主题两侧都有记录，就是一条分水岭", () => {
    const dossier = buildDossier([
      evidence({ subject: "交付", side: "kept", context: "有人盯着" }),
      evidence({ subject: "交付", side: "kept", context: "有人盯着" }),
      evidence({ subject: "交付", side: "unkept", context: "没人管" }),
    ]);
    expect(dossier.divides).toHaveLength(1);
    expect(dossier.divides[0].keptContexts).toEqual(["有人盯着"]);
    expect(dossier.divides[0].unkeptContexts).toEqual(["没人管"]);
  });

  it("一边倒的主题不算分水岭", () => {
    const dossier = buildDossier([
      evidence({ subject: "交付", side: "kept" }),
      evidence({ subject: "交付", side: "kept" }),
    ]);
    expect(dossier.divides).toHaveLength(0);
  });

  it("四个项目全做完、零采纳：两边各成一条，互不抵消", () => {
    const deeds = Array.from({ length: 4 }, (_, index) =>
      deed({ id: `d${index}`, outcome: "done", adopted: false })
    );
    const dossier = buildDossier(deeds.flatMap(fromDeed));

    const canFinish = dossier.kept.find((label) =>
      label.subject.includes("做完")
    );
    const nobodyWants = dossier.unkept.find((label) =>
      label.subject.includes("有人要")
    );

    expect(canFinish?.evidence).toHaveLength(4);
    expect(nobodyWants?.evidence).toHaveLength(4);
    expect(dossier.divides).toHaveLength(0);
  });

  it("同一条证据不会因为重复传入被算两次", () => {
    const one = evidence({ key: "same" });
    expect(buildDossier([one, one, one]).total).toBe(1);
  });

  it("证据按时间倒序，最近的排在前面", () => {
    const dossier = buildDossier([
      evidence({ subject: "交付", occurredOn: "2026-01-01" }),
      evidence({ subject: "交付", occurredOn: "2026-05-05" }),
    ]);
    expect(dossier.kept[0].evidence[0].occurredOn).toBe("2026-05-05");
  });
});

describe("空档案", () => {
  it("一条都没有时如实报空，并说清哪几类是零", () => {
    const result = emptiness(buildDossier([]));
    expect(result.empty).toBe(true);
    expect(result.missing).toContain("prediction");
    expect(result.missing).toContain("window");
  });

  it("有了一类之后，缺的那几类还得继续报", () => {
    const result = emptiness(buildDossier([evidence({ source: "prediction" })]));
    expect(result.empty).toBe(false);
    expect(result.missing).not.toContain("prediction");
    expect(result.missing).toContain("window");
  });
});

describe("推翻条件按来源说话", () => {
  it("采纳那栏问的是有没有人用，不是说到做到", () => {
    const deeds = Array.from({ length: 4 }, (_, index) =>
      deed({ id: `d${index}`, outcome: "done", adopted: false })
    );
    const dossier = buildDossier(deeds.flatMap(fromDeed));
    const nobodyWants = dossier.unkept.find((label) =>
      label.subject.includes("有人要")
    );
    expect(nobodyWants?.falsifier).toContain("有人真的用起来");
  });

  it("做完那栏问的是有没有烂尾", () => {
    const deeds = Array.from({ length: 4 }, (_, index) =>
      deed({ id: `d${index}`, outcome: "done", adopted: null })
    );
    const dossier = buildDossier(deeds.flatMap(fromDeed));
    expect(dossier.kept[0].falsifier).toContain("开了头没做完");
  });

  it("窗口那栏问的是情况来了动没动", () => {
    const dossier = buildDossier(
      Array.from({ length: 3 }, () =>
        evidence({ source: "window", side: "unkept", subject: "开口求人" })
      )
    );
    expect(dossier.unkept[0].falsifier).toContain("赶上这种情况你动了");
  });
});
