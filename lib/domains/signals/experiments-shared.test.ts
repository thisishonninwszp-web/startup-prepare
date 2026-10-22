import { describe, expect, it } from "vitest";
import { doorProposals, experimentStats, issueProposals, resolveDoorSignups, resolveDoorViews, resolveIssueViews, thresholdFrom } from "./experiments-shared";

describe("先猜自己实验的结果", () => {
  it("门槛取他过去同类实验的中位数；没有历史用默认", () => {
    expect(thresholdFrom([], 30)).toBe(30);
    expect(thresholdFrom([10, 40, 20], 30)).toBe(20);
    expect(thresholdFrom([0, 0], 1)).toBe(1);
  });

  it("开着的假门出两道（留邮箱、被看），从现在的数往后算；关着的不出", () => {
    const door = { id: "d", title: "家事代行の予約代行", open: true, views: 12, signups: 1 };
    const ps = doorProposals(door, { signups: [], views: [40, 60] }, "2026-10-22");
    expect(ps.map((p) => [p.kind, p.threshold, p.baseline, p.dueOn])).toEqual([
      ["door_signups", 1, 1, "2026-11-05"],
      ["door_views", 50, 12, "2026-11-05"],
    ]);
    expect(doorProposals({ ...door, open: false }, { signups: [], views: [] }, "2026-10-22")).toEqual([]);
  });

  it("周刊刚发出去两天以内的平台才能猜，一个平台一道", () => {
    const issue = {
      id: "i",
      weekStart: "2026-10-19",
      published: [
        { platform: "小红书" as const, url: "", at: "2026-10-21T10:00:00Z" },
        { platform: "note" as const, url: "", at: "2026-10-15T10:00:00Z" },
      ],
    };
    const ps = issueProposals(issue, { 小红书: [300, 500] }, "2026-10-22");
    expect(ps.map((p) => [p.platform, p.threshold, p.dueOn])).toEqual([["小红书", 400, "2026-10-28"]]);
  });

  it("对账：留邮箱只数猜了以后、到期以前的；被看减去猜的时候的数", () => {
    const f = { kind: "door_signups" as const, platform: "", threshold: 1, baseline: 1, start_at: "2026-10-22T03:00:00Z", due_on: "2026-11-05" };
    expect(resolveDoorSignups(f, ["2026-10-21T00:00:00Z", "2026-10-30T00:00:00Z", "2026-11-06T00:00:00Z"])).toEqual({ observed: 1, outcome: true });
    expect(resolveDoorViews({ ...f, kind: "door_views", threshold: 50, baseline: 12 }, 40)).toEqual({ observed: 28, outcome: false });
  });

  it("周刊：到期以后他填了数才对账，几篇加起来", () => {
    const f = { kind: "issue_views" as const, platform: "小红书", threshold: 400, baseline: 0, start_at: "2026-10-21T00:00:00Z", due_on: "2026-10-28" };
    const m = (pick: number, views: number, at: string) => ({ pick, platform: "小红书" as const, views, likes: null, saves: null, comments: null, at });
    expect(resolveIssueViews(f, [m(0, 200, "2026-10-24T00:00:00Z")])).toBeNull();
    expect(resolveIssueViews(f, [m(0, 300, "2026-10-29T00:00:00Z"), m(1, 150, "2026-10-29T00:00:00Z")])).toEqual({ observed: 450, outcome: true });
  });

  it("满 10 道才给分", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ probability: 0.7, outcome: i < 7 }));
    expect(experimentStats(rows).brier).toBeCloseTo(0.21, 6);
    expect(experimentStats(rows.slice(0, 9)).brier).toBeNull();
  });
});
