import { describe, expect, it } from "vitest";
import type { JapanGap } from "./gaps-shared";
import type { VoiceQuote } from "./voices-shared";
import {
  chooseWeekPick,
  describeWeekPick,
  evidenceLine,
  pickEvidence,
  WEEK_PICK_TAG,
  weekPickDraft,
  weekPickRiskiest,
  whoToAsk,
  type WeekPickInput,
} from "./week-pick-shared";

const found = { status: "supported" as const, basis: [{ url: "https://example.jp", title: "t", excerpt: "原文" }] };

function gap(over: Partial<JapanGap> = {}): JapanGap {
  return {
    signal_id: "s1",
    brief_date: "2026-11-15",
    headline: "“养基宝”APP 把几家平台的基金放在一起看",
    title: "t",
    url: "https://news.example/1",
    source: "news:36kr",
    background: "b",
    japan: "没有。日本的理财 App 只看自己一家的账户。",
    check: found,
    ...over,
  };
}

const quote = (kind: VoiceQuote["kind"], excerpt = "每次都要打开三个 App 才知道一共赚了多少"): VoiceQuote => ({
  kind,
  excerpt,
  url: "https://chiebukuro.example/q/1",
  title: "投資信託 まとめて見たい",
  from: "web",
});

function input(over: Partial<WeekPickInput> = {}): WeekPickInput {
  return { side: "japan", gap: gap(), voices: null, transfer: null, signups: 0, isIdea: false, ...over };
}

// 2026-11-15 是周日，这一周从 11-09 起
const SUNDAY = "2026-11-15";

describe("周末的一件：挑哪一条", () => {
  it("这周进清单的里，先看留了邮箱的人，再看已经在花钱绕路的原话，再看原话总数", () => {
    const a = input({ gap: gap({ signal_id: "a" }), voices: { quotes: [quote("complain"), quote("complain"), quote("complain")] } });
    const b = input({ gap: gap({ signal_id: "b" }), voices: { quotes: [quote("workaround")] } });
    const c = input({ gap: gap({ signal_id: "c", brief_date: "2026-11-10" }), signups: 1 });
    expect(chooseWeekPick([a, b], SUNDAY)?.pick.gap.signal_id).toBe("b");
    expect(chooseWeekPick([a, b, c], SUNDAY)?.pick.gap.signal_id).toBe("c");
    expect(chooseWeekPick([a, b, c], SUNDAY)).toMatchObject({ scope: "week", pool: 3 });
  });

  it("已经变成想法的不挑；根据一样多时挑新的", () => {
    const old = input({ gap: gap({ signal_id: "old", brief_date: "2026-11-10" }) });
    const fresh = input({ gap: gap({ signal_id: "fresh", brief_date: "2026-11-14" }) });
    expect(chooseWeekPick([old, fresh], SUNDAY)?.pick.gap.signal_id).toBe("fresh");
    expect(chooseWeekPick([old, { ...fresh, isIdea: true }], SUNDAY)?.pick.gap.signal_id).toBe("old");
  });

  it("这周没有新进清单的，前几个周日摆过的先跳过，不一连几周摆同一条", () => {
    // 11-01 那一周进来两条：那个周日摆了 strong；之后两周都没有新的
    const strong = input({ gap: gap({ signal_id: "strong", brief_date: "2026-10-28" }), voices: { quotes: [quote("workaround")] } });
    const weak = input({ gap: gap({ signal_id: "weak", brief_date: "2026-10-27" }) });
    expect(chooseWeekPick([strong, weak], "2026-11-01")?.pick.gap.signal_id).toBe("strong");
    expect(chooseWeekPick([strong, weak], "2026-11-08")?.pick.gap.signal_id).toBe("weak");
    expect(chooseWeekPick([strong, weak], "2026-11-15")?.pick.gap.signal_id).toBe("strong");
    // 只剩一条时照样摆它
    expect(chooseWeekPick([strong], "2026-11-08")?.pick.gap.signal_id).toBe("strong");
  });

  it("这周没有新进清单的，从最近四周里挑；四周以前的、都变成想法了的就不放", () => {
    const lastMonth = input({ gap: gap({ signal_id: "m", brief_date: "2026-10-20" }) });
    const tooOld = input({ gap: gap({ signal_id: "x", brief_date: "2026-10-17" }) });
    expect(chooseWeekPick([lastMonth, tooOld], SUNDAY)).toMatchObject({ scope: "month", pool: 1, pick: { gap: { signal_id: "m" } } });
    expect(chooseWeekPick([tooOld], SUNDAY)).toBeNull();
    expect(chooseWeekPick([{ ...lastMonth, isIdea: true }], SUNDAY)).toBeNull();
  });
});

describe("周末的一件：先去问谁", () => {
  it("留了邮箱的人排第一，写进最小实验的是写信", () => {
    const w = whoToAsk(input({ signups: 2, voices: { quotes: [quote("workaround")] } }));
    expect(w.lines.map((l) => l.who)).toEqual(["假门上留了邮箱的 2 个人", "已经在花钱、花力气绕路的人"]);
    expect(w.test).toContain("给假门上留了邮箱的 2 个人各写一封信");
  });

  it("已经在绕路的原话带一句例子；评分人数太少的 App 不算这边的人在用", () => {
    const w = whoToAsk(
      input({
        voices: {
          quotes: [quote("complain"), quote("workaround", "我现在用 Excel 每周手动抄一遍三个账户的数，抄了两年，每次都要一个小时以上才能弄完，弄完还经常抄错一两个数，第二周又得从头对一遍")],
          apps: [
            { name: "没人用的", ratings: 3, url: "https://apps.example/1" },
            { name: "マネーフォワード ME", ratings: 182863, url: "https://apps.example/2" },
          ],
        },
      })
    );
    expect(w.lines[0]).toMatchObject({ who: "已经在花钱、花力气绕路的人" });
    expect(w.lines[0].quote?.excerpt.endsWith("…")).toBe(true);
    expect(w.lines[1].who).toBe("正在用「マネーフォワード ME」的人");
    expect(w.lines[1].how).toContain("182863 人评过分");
    expect(w.test).toBe("这周找 3 个已经在花钱、花力气绕路的人聊一次：现在花多少钱或时间、为什么还没换。");
  });

  it("只有抱怨的原话：写明只算有人头疼、不说明愿意付钱", () => {
    const w = whoToAsk(input({ voices: { quotes: [quote("complain"), quote("seek")] } }));
    expect(w.lines).toHaveLength(1);
    expect(w.lines[0].how).toContain("2 句原话");
    expect(w.lines[0].how).toContain("不说明愿意付钱");
  });

  it("什么根据都没有：不编人，叫他先去听一听", () => {
    expect(whoToAsk(input())).toEqual({ lines: [], test: "先在这一条上点「听一听」，找到这边在为这件事头疼的人，再找 3 个聊一次。" });
  });
});

describe("周末的一件：变成想法时填什么", () => {
  const blocked = {
    conditions: [{ name: "大家用支付宝", there: "t", here: "日本多用银行转账", holds: "no" as const, basis: [{ url: "u", title: "t", excerpt: "e" }] }],
    precedent: null,
    created_at: "2026-11-01",
  };

  it("查过能不能搬过来、有一条不成立的，最关键的假设就是它", () => {
    expect(weekPickRiskiest(input({ transfer: blocked }))).toContain("「大家用支付宝」");
  });

  it("没查过的：所有差距都卡在同一处 —— 这边没有，不是因为没人要", () => {
    expect(weekPickRiskiest(input())).toBe("日本这边还没有它，不是因为没人要 —— 得有人觉得现在的办法不够用，愿意为它换、为它付钱。");
  });

  it("标题和差距清单变成的想法一样（本周行动认得出），多一个「周末一件」标签，最小实验是先去问谁", () => {
    const d = weekPickDraft(input({ voices: { quotes: [quote("workaround")] } }));
    expect(d.title).toBe("日本版：“养基宝”APP 把几家平台的基金放在一起看");
    expect(d.tags).toEqual(["外部", "中日差距", WEEK_PICK_TAG]);
    expect(d.hypothesis.smallest_test).toContain("已经在花钱、花力气绕路的人");
    expect(d.hypothesis.alternative).toContain("日本这边");
    // 目标用户、痛点、愿付多少留给他问过人再填
    expect(d.hypothesis).not.toHaveProperty("target_user");
    expect(d.hypothesis).not.toHaveProperty("pain");
    expect(d.hypothesis).not.toHaveProperty("willingness_to_pay");
  });
});

describe("周末的一件：根据那一行", () => {
  it("只摆数，不合计", () => {
    const e = pickEvidence(input({ signups: 1, voices: { quotes: [quote("workaround"), quote("complain")] }, gap: gap({ basis: ["a", "b"] }) }));
    expect(evidenceLine(e)).toBe("根据：假门上留了邮箱 1 人；网上原话 2 句（1 句已经在花钱、花力气绕路）；报告里核对过的原文 2 段。");
  });

  it("没听过和听过没找到分开说；有人拿到投资时说你晚了一步", () => {
    expect(evidenceLine(pickEvidence(input()))).toBe("根据：还没听过这边的人怎么说。");
    const funded = { company: "某社", url: "u", excerpt: "e" };
    expect(evidenceLine(pickEvidence(input({ voices: { quotes: [] }, gap: gap({ funded }) })))).toBe(
      "根据：听过一次，这边没找到在说这件麻烦的原话；这边已经有公司为它拿到投资（方向有人验证过，你也晚了一步）。"
    );
  });

  it("为什么是这一条：这周的几条里根据最多的；邮件链接落地页不说", () => {
    const choice = chooseWeekPick([input()], SUNDAY)!;
    expect(describeWeekPick(choice.pick, choice).why).toBe("这周进差距清单（中国有、日本还没有）的 1 条里，根据最多的一条。");
    expect(describeWeekPick(choice.pick).why).toBe("");
  });
});
