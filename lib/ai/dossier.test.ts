import { describe, expect, it } from "vitest";
import { applyNames, parseDossierNames } from "./dossier";
import { buildDossier, type DossierEvidence } from "@/lib/domains/self-model/dossier";

const subjects = new Set(["交付"]);
const parse = parseDossierNames(subjects);

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

describe("AI 输出在解析器里再挡一次", () => {
  it("正常的一条收下", () => {
    const out = parse({
      labels: [
        { subject: "交付", name: "做完了没人要", because: "四次都做完了，没有一次被用上" },
      ],
    });
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0].name).toBe("做完了没人要");
  });

  it("带数字的丢掉 —— 数字只能由代码填", () => {
    const out = parse({
      labels: [{ subject: "交付", name: "4 次全没人要", because: "看记录" }],
    });
    expect(out.labels).toHaveLength(0);
  });

  it("夸人的丢掉", () => {
    const out = parse({
      labels: [{ subject: "交付", name: "执行力", because: "你很有潜力" }],
    });
    expect(out.labels).toHaveLength(0);
  });

  it("现成人格标签丢掉", () => {
    const out = parse({
      labels: [{ subject: "交付", name: "完美主义", because: "每次都反复打磨" }],
    });
    expect(out.labels).toHaveLength(0);
  });

  it("凭空捏造一个主题的丢掉 —— 没有证据的簇不存在", () => {
    const out = parse({
      labels: [{ subject: "社交", name: "怕生", because: "看着像" }],
    });
    expect(out.labels).toHaveLength(0);
  });

  it("缺 because 的丢掉，标签不许悬空", () => {
    const out = parse({ labels: [{ subject: "交付", name: "做完了没人要" }] });
    expect(out.labels).toHaveLength(0);
  });

  it("输出乱七八糟时不炸，返回空", () => {
    expect(parse(null).labels).toHaveLength(0);
    expect(parse({ labels: "nope" }).divides).toHaveLength(0);
  });
});

describe("贴名字", () => {
  it("只动 name 和 because，代码算的字段一个不动", () => {
    const dossier = buildDossier([
      evidence({ side: "kept" }),
      evidence({ side: "kept" }),
      evidence({ side: "kept" }),
    ]);
    const before = dossier.kept[0];

    const after = applyNames(dossier, {
      labels: [{ subject: "交付", name: "说到做到", because: "三次都兑现了" }],
      divides: [],
    });

    expect(after.kept[0].name).toBe("说到做到");
    expect(after.kept[0].because).toBe("三次都兑现了");
    expect(after.kept[0].falsifier).toBe(before.falsifier);
    expect(after.kept[0].flipsAfter).toBe(before.flipsAfter);
    expect(after.kept[0].evidence).toHaveLength(3);
  });

  it("AI 没给名字的簇保持无名，不编一个", () => {
    const dossier = buildDossier([evidence()]);
    const after = applyNames(dossier, { labels: [], divides: [] });
    expect(after.kept[0].name).toBeNull();
  });
});

describe("重名", () => {
  it("两簇拿到同一个名字时只留第一条 —— 糊成一簇正是要避免的事", () => {
    const parseTwo = parseDossierNames(new Set(["做完", "有人要"]));
    const out = parseTwo({
      labels: [
        { subject: "做完", name: "做完了没人要", because: "四次都做完了" },
        { subject: "有人要", name: "做完了没人要", because: "四次都没人用" },
      ],
    });
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0].subject).toBe("做完");
  });
});
