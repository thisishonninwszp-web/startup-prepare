import { describe, expect, it } from "vitest";
import { dueGaps } from "./info-gaps-shared";

describe("信息缺口：该拿了的", () => {
  it("dueGaps：还缺、而且截止到了的才算", () => {
    const gaps = [
      { status: "open" as const, due_on: "2026-10-19" },
      { status: "open" as const, due_on: "2026-10-20" },
      { status: "open" as const, due_on: "2026-10-30" },
      { status: "got" as const, due_on: "2026-10-01" },
    ];
    expect(dueGaps(gaps, "2026-10-20")).toBe(2);
  });
});

describe("自己去数一数：有多少人在问", () => {
  it("askLinks：日本这边四个网站，中国这边三个；空的不给", async () => {
    const { askLinks } = await import("./info-gaps-shared");
    const ja = askLinks("家事代行 中国語");
    expect(ja.map((l) => l.url.split("/")[2])).toEqual(["chiebukuro.yahoo.co.jp", "trends.google.co.jp", "search.yahoo.co.jp", "coconala.com"]);
    expect(ja[0].url).toContain(encodeURIComponent("家事代行 中国語"));
    expect(askLinks("上门家政", "中国")).toHaveLength(3);
    expect(askLinks("  ")).toEqual([]);
  });
});

it('new derived references do not count as real activity; legacy evidence retains eligibility', async()=>{
 const {hasLegacyActivityEvidence}=await import('./info-gaps-shared');
 const base={title:'test',at:'2026-10-26'};
 expect(hasLegacyActivityEvidence([{...base,experiment_id:'exp',experiment_run_id:'run'}])).toBe(false);
 expect(hasLegacyActivityEvidence([{...base,observation_run_id:'obs'}])).toBe(false);
 expect(hasLegacyActivityEvidence([{...base,experiment_run_id:'run'}, {...base,signal_id:'legacy'}])).toBe(true);
 expect(hasLegacyActivityEvidence([base])).toBe(true);
});
