import { describe, expect, it } from "vitest";
import { pestleCoverage } from "./coverage";

describe("PESTLE 查漏", () => {
  it("每个领域数精选里出现几次，也值得一看的不算", () => {
    const c = pestleCoverage([{ domain: "economic" }, { domain: "economic" }, { domain: "legal", extra: true }, {}]);
    expect(c.find((x) => x.domain === "economic")?.count).toBe(2);
    expect(c.find((x) => x.domain === "legal")?.count).toBe(0);
    expect(c).toHaveLength(6);
  });
});
