import { describe, expect, it } from "vitest";
import { crossovers, descendantsOf, destinationOf } from "./paths";
import { SKILL_DEFS, SKILL_LAYERS } from "./skills";

describe("destinationOf", () => {
  it("shows what a plain-looking basic skill actually leads to", () => {
    // 「记录」看着只是个基本功，它其实压着复盘、预测、排期、人证、留存。
    const dest = destinationOf("record");
    expect(dest.next.map((def) => def.key)).toContain("retro");
    expect(dest.signatures.length).toBeGreaterThan(0);
    expect(dest.classes.length).toBeGreaterThan(1);
  });

  it("names the classes a skill is a mandatory step for", () => {
    // 拆解是「交接」的祖先，而交接是拆解师的印记。
    expect(destinationOf("decompose").gateFor.map((item) => item.key)).toContain(
      "decomposer"
    );
  });

  it("gives a signature no downstream of its own", () => {
    expect(destinationOf("ownership").next).toEqual([]);
  });

  it("never reports a skill as its own descendant", () => {
    for (const def of SKILL_DEFS) {
      expect(descendantsOf(def.key), def.key).not.toContain(def.key);
    }
  });
});

describe("crossovers", () => {
  it("finds nothing when only one line has been walked", () => {
    expect(crossovers(new Map([["record", 2]]))).toEqual([]);
  });

  it("ignores two basics bumping into each other", () => {
    // 元件层撞元件层不算比较优势，那只是两个基本功。
    expect(
      crossovers(
        new Map([
          ["record", 3],
          ["listening", 3],
        ])
      )
    ).toEqual([]);
  });

  it("pairs two deep lines that share no ancestor", () => {
    const found = crossovers(
      new Map([
        ["interrogate", 2],
        ["mediating", 2],
      ])
    );
    expect(found).toHaveLength(1);
    expect(found[0].why).toContain("没有共用任何地基");
  });

  it("refuses a pair where one stands on the other", () => {
    // 集成建在逆向之上，那不是远交，那是同一条线。
    expect(
      crossovers(
        new Map([
          ["reverseeng", 2],
          ["integration", 2],
        ])
      )
    ).toEqual([]);
  });

  it("orders by how deep both sides are", () => {
    const found = crossovers(
      new Map([
        ["interrogate", 1],
        ["mediating", 1],
        ["ownership", 1],
        ["retention", 1],
        ["writing", 1],
        ["finance", 1],
      ])
    );
    expect(found.length).toBeGreaterThan(1);
    const depth = (index: number) =>
      SKILL_LAYERS.indexOf(found[index].a.layer) +
      SKILL_LAYERS.indexOf(found[index].b.layer);
    for (let i = 1; i < found.length; i += 1) {
      expect(depth(i - 1)).toBeGreaterThanOrEqual(depth(i));
    }
  });

  it("rejects a pair that shares a real line, not just the basics", () => {
    // 担责和留存都踩在「识伪」上 —— 共用一条回路层的地基，那不是远交。
    expect(
      crossovers(
        new Map([
          ["ownership", 1],
          ["retention", 1],
        ])
      )
    ).toEqual([]);
  });
});
