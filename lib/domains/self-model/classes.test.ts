import { describe, expect, it } from "vitest";
import { CLASS_DEFS, classFits, unknownClassSkills } from "./classes";
import { SKILL_DEFS } from "./skills";

describe("class catalogue", () => {
  it("only names skills that exist", () => {
    expect(unknownClassSkills()).toEqual([]);
  });

  it("gives every class its own signature at the deepest layer", () => {
    const signatures = CLASS_DEFS.map((def) => def.signature);
    expect(new Set(signatures).size).toBe(CLASS_DEFS.length);
    for (const key of signatures) {
      const def = SKILL_DEFS.find((item) => item.key === key)!;
      expect(def.layer, key).toBe("signature");
    }
  });

  it("spans layers inside one class — not seven skills of the same depth", () => {
    for (const klass of CLASS_DEFS) {
      const layers = new Set(
        klass.skills.map(
          (key) => SKILL_DEFS.find((def) => def.key === key)!.layer
        )
      );
      expect(layers.size, klass.key).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("classFits", () => {
  it("reports nothing but zeroes before you light anything", () => {
    const fits = classFits(new Map());
    expect(fits).toHaveLength(CLASS_DEFS.length);
    expect(fits.every((fit) => fit.started === 0)).toBe(true);
    expect(fits.every((fit) => fit.nextSkill !== null)).toBe(true);
  });

  it("puts the shape you actually walked on top", () => {
    const questioner = CLASS_DEFS.find((def) => def.key === "questioner")!;
    const reached = new Map(questioner.skills.map((key) => [key, 3]));
    expect(classFits(reached)[0].def.key).toBe("questioner");
  });

  it("counts started and deep separately, and never sums them", () => {
    const fit = classFits(new Map([["record", 1], ["structure", 4]]))
      .find((item) => item.def.key === "decomposer")!;
    expect(fit).toMatchObject({ started: 2, deep: 1, total: 7 });
  });

  it("points at the shallowest skill you have not begun", () => {
    const fit = classFits(new Map([["record", 2]])).find(
      (item) => item.def.key === "decomposer"
    )!;
    expect(fit.nextSkill).toBe("structure");
  });

  it("knows whether the signature is lit", () => {
    expect(
      classFits(new Map([["handover", 1]])).find(
        (item) => item.def.key === "decomposer"
      )!.signatureLit
    ).toBe(true);
  });
});
