import { describe, expect, it } from "vitest";
import { selectAll } from "./supabase-all";

describe("selectAll", () => {
  it("一页页取到不满 1000 行为止", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const calls: [number, number][] = [];
    const r = await selectAll(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(r.data).toHaveLength(2345);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("出错就停，带回已经取到的", async () => {
    const r = await selectAll(async (from) => (from === 0 ? { data: Array(1000).fill(1), error: null } : { data: null, error: { message: "boom" } }));
    expect(r.data).toHaveLength(1000);
    expect(r.error?.message).toBe("boom");
  });
});
