import { describe, expect, it } from "vitest";
import { actFunnel, movedGaps, nextSteps, type ActGap, type ActState } from "./act-shared";

const gap = (over: Partial<ActGap> = {}): ActGap => ({ side: "japan", signal_id: "s1", headline: "无人配送", quotes: null, door: null, idea: null, ...over });
const door = (over: Partial<NonNullable<ActGap["door"]>> = {}) => ({ open: true, views: 0, signups: 0, contacted: 0, created_at: "2026-10-01", title: "近所の配送", ...over });
const state = (over: Partial<ActState> = {}): ActState => ({ today: "2026-10-20", gaps: [gap()], uncontacted: [], dueJudgments: 0, issue: "published", infoGaps: [], ...over });

describe("本周行动：这周最该做的一件事", () => {
  it("有人留了邮箱没联系，排第一（离真实接触最近）", () => {
    const steps = nextSteps(
      state({
        uncontacted: [{ id: "u1", email: "tanaka@example.jp", created_at: "2026-10-10", doorTitle: "近所の配送", doorHref: "/signals/gaps/door?side=japan&signal=s1" }],
        dueJudgments: 2,
        issue: "none",
      })
    );
    expect(steps[0].key).toBe("contact");
    // 邮箱打码
    expect(steps[0].text).toContain("t***@example.jp");
    expect(steps.map((s) => s.key)).toEqual(["contact", "judgments", "issue", "listen"]);
  });

  it("联系过、变成了想法却没记验证：提醒去想法里记", () => {
    const steps = nextSteps(state({ gaps: [gap({ quotes: 5, door: door({ signups: 1, contacted: 1 }), idea: { id: "i1", validations: 0 } })] }));
    expect(steps[0]).toMatchObject({ key: "record", href: "/ideas/i1" });
  });

  it("假门开了一周还没几个人看：问题在流量", () => {
    const steps = nextSteps(state({ gaps: [gap({ quotes: 5, door: door({ views: 2 }) })] }));
    expect(steps[0].key).toBe("traffic");
    expect(steps[0].text).toContain("19 天");
  });

  it("原话听到三句以上、没开假门：挑最多的那条去开", () => {
    const steps = nextSteps(state({ gaps: [gap({ signal_id: "a", headline: "甲", quotes: 3 }), gap({ signal_id: "b", headline: "乙", quotes: 8 })] }));
    expect(steps[0]).toMatchObject({ key: "door", href: "/signals/gaps/door?side=japan&signal=b" });
  });

  it("什么都没卡住时也给一件事", () => {
    const steps = nextSteps(state({ gaps: [gap({ quotes: 1 })] }));
    expect(steps.map((s) => s.key)).toEqual(["idle"]);
  });
});

describe("本周行动：漏斗和动过的几条", () => {
  const gaps = [
    gap({ signal_id: "a" }),
    gap({ signal_id: "b", quotes: 2 }),
    gap({ signal_id: "c", quotes: 6, door: door({ signups: 2, contacted: 1 }), idea: { id: "i", validations: 1 } }),
  ];
  it("actFunnel：每一格几条", () => {
    expect(actFunnel(gaps).map((f) => f.count)).toEqual([3, 2, 1, 1, 1, 1, 1]);
  });
  it("movedGaps：一格都没动过的不列，走得远的在前", () => {
    expect(movedGaps(gaps).map((g) => g.signal_id)).toEqual(["c", "b"]);
  });
});

describe("本周行动：想法还缺的信息", () => {
  const ig = (due_on: string) => ({ id: "g1", idea_id: "i1", idea_title: "在日华人家政", question: "有没有人在花钱请人代办", due_on });
  it("三天内截止或已经过了的，排在对账前面", () => {
    const steps = nextSteps(state({ dueJudgments: 1, infoGaps: [ig("2026-10-22")] }));
    expect(steps.map((s) => s.key).slice(0, 2)).toEqual(["info-gap", "judgments"]);
    expect(steps[0].href).toBe("/ideas/i1#gaps");
    expect(nextSteps(state({ infoGaps: [ig("2026-10-19")] }))[0].text).toContain("已经过了截止");
  });
  it("还早的不抢先；但什么都没卡住时，给离截止最近的那个", () => {
    const steps = nextSteps(state({ gaps: [gap({ quotes: 1 })], infoGaps: [ig("2026-11-10")] }));
    expect(steps.map((s) => s.key)).toEqual(["info-gap"]);
    expect(steps[0].text).toContain("2026-11-10 截止");
  });
});
