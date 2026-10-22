import { describe, expect, it } from "vitest";
import { publicEarlier, publicItem, publicMonthlyLine } from "./shared-view";

describe("shared view", () => {
  it("drops the owner-only fields of an item", () => {
    const item = { signal_id: "s", headline: "h", personal: "跟你有关", personal_edge: true, related_question: { id: "q", question: "x", why: "y" }, for_you: "f" };
    expect(publicItem(item)).toEqual({ signal_id: "s", headline: "h", for_you: "f" });
  });

  it("drops the owner's earlier judgment", () => {
    const out = publicEarlier({
      s: { brief_date: "2026-10-01", signal_id: "s", headline: "h", times: 2, judgment: { judgment: "会", due_at: "2027-01-01", outcome: "pending", brief_date: "2026-10-01" } },
    });
    expect(out.s).toEqual({ brief_date: "2026-10-01", signal_id: "s", headline: "h", times: 2 });
  });

  it("drops monthly links to the owner's gaps and ideas", () => {
    const line = { title: "t", note: "n", weeks: [], status: "still" as const, threads: [], related: [{ kind: "idea" as const, id: "i", title: "x" }], next: "gaps" as const, why: "w" };
    expect(publicMonthlyLine(line)).toMatchObject({ related: [], next: null, why: "" });
  });
});
