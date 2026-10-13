import { describe, expect, it } from "vitest";
import { LAB_VARIANTS, pickOverlap, shuffledDisplay, tallyLab, type LabRun } from "./lab-shared";

describe("挑法盲测", () => {
  it("shuffledDisplay：四种都在、不重复；顺序跟着随机数变", () => {
    const a = shuffledDisplay(() => 0);
    const b = shuffledDisplay(() => 0.99);
    expect([...a].sort()).toEqual([...LAB_VARIANTS].sort());
    expect([...b].sort()).toEqual([...LAB_VARIANTS].sort());
    expect(a).not.toEqual(b);
  });

  it("tallyLab：每种被选中几次；没选的那次不算", () => {
    const run = (chosen: LabRun["chosen"]): LabRun => ({ id: "r", kind: "news", variants: [], display: [], chosen, created_at: "" });
    expect(tallyLab([run("two_round"), run("two_round"), run("current"), run(null)])).toEqual([
      { key: "current", chosen: 1 },
      { key: "thinking", chosen: 0 },
      { key: "two_round", chosen: 2 },
      { key: "strong", chosen: 0 },
    ]);
  });

  it("pickOverlap：每条被几组挑中", () => {
    const pick = (id: string) => ({ signal_id: id, title: id, url: null, source: "s" });
    const overlap = pickOverlap([
      { key: "current", picks: [pick("a"), pick("b")] },
      { key: "thinking", picks: [pick("a"), pick("c")] },
      { key: "strong", picks: [], error: "超时没挑完" },
    ]);
    expect(Object.fromEntries(overlap)).toEqual({ a: 2, b: 1, c: 1 });
  });
});
