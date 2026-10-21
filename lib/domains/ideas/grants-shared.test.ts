import { describe, expect, it } from "vitest";
import { isGrantArea, mergeGrants, parseGrants } from "./grants-shared";

describe("jGrants", () => {
  it("reads id, title, deadline, max and area; 0 means not written", () => {
    const out = parseGrants({
      result: [
        { id: "a0W1", title: " 創業補助金 ", acceptance_end_datetime: "2026-12-15T08:00:00.000Z", subsidy_max_limit: 500000, target_area_search: "奈良県", target_number_of_employees: "従業員の制約なし" },
        { id: "a0W2", title: "ふるさと", acceptance_end_datetime: null, subsidy_max_limit: 0, target_area_search: "東京都" },
        { title: "no id" },
      ],
    });
    expect(out).toEqual([
      { id: "a0W1", title: "創業補助金", url: "https://www.jgrants-portal.go.jp/subsidy/a0W1", deadline: "2026-12-15", max: 500000, area: "奈良県", employees: "従業員の制約なし" },
      { id: "a0W2", title: "ふるさと", url: "https://www.jgrants-portal.go.jp/subsidy/a0W2", deadline: "", max: null, area: "東京都", employees: "" },
    ]);
    expect(parseGrants({ message: "error" })).toEqual([]);
  });

  it("merges, dedupes and puts earlier deadlines first", () => {
    const g = (id: string, deadline: string) => ({ id, title: id, url: "", deadline, max: null, area: "", employees: "" });
    expect(mergeGrants([[g("b", "2027-01-01"), g("a", "")], [g("c", "2026-11-01"), g("b", "2027-01-01")]]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("knows the area names", () => {
    expect(isGrantArea("東京都")).toBe(true);
    expect(isGrantArea("Tokyo")).toBe(false);
  });
});
