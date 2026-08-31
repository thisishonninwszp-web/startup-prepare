import { describe, expect, it } from "vitest";
import {
  MIN_CLASS_SAMPLE,
  priorFor,
  referenceClasses,
  type Deed,
} from "./deeds";

function deed(over: Partial<Deed> = {}): Deed {
  return {
    id: Math.random().toString(36).slice(2),
    occurredOn: "2024-01-01",
    title: "做了个东西",
    classKey: "自发项目",
    outcome: "done",
    adopted: false,
    durationDays: 90,
    cost: null,
    ...over,
  };
}

describe("referenceClasses", () => {
  it("groups by class and counts outcomes", () => {
    const [cls] = referenceClasses([
      deed(),
      deed({ outcome: "abandoned" }),
      deed({ outcome: "ongoing" }),
    ]);
    expect(cls).toMatchObject({ key: "自发项目", n: 3, done: 1, abandoned: 1, ongoing: 1 });
  });

  it("withholds every rate until there are enough settled cases", () => {
    const [cls] = referenceClasses([deed(), deed()]);
    expect(cls.doneRate).toBeNull();
    expect(cls.adoptedRate).toBeNull();
    expect(cls.medianDays).toBeNull();
  });

  it("does not count ongoing work in the completion rate", () => {
    const [cls] = referenceClasses([
      deed(),
      deed(),
      deed({ outcome: "abandoned" }),
      deed({ outcome: "ongoing" }),
      deed({ outcome: "ongoing" }),
    ]);
    // 已结束 3 件里做完 2 件，进行中的不算分母。
    expect(cls.doneRate).toBe(67);
  });

  it("counts adoption only where it applies", () => {
    const [cls] = referenceClasses([
      deed({ adopted: true }),
      deed({ adopted: false }),
      deed({ adopted: false }),
      deed({ adopted: null }),
    ]);
    expect(cls.adoptedSample).toBe(3);
    expect(cls.adoptedRate).toBe(33);
  });

  it("takes the median duration of settled work", () => {
    const [cls] = referenceClasses([
      deed({ durationDays: 30 }),
      deed({ durationDays: 90 }),
      deed({ durationDays: 300 }),
    ]);
    expect(cls.medianDays).toBe(90);
  });

  it("sorts the biggest class first", () => {
    const classes = referenceClasses([
      deed({ classKey: "换环境" }),
      deed(),
      deed(),
    ]);
    expect(classes[0].key).toBe("自发项目");
  });
});

describe("priorFor", () => {
  const many = referenceClasses(
    Array.from({ length: 9 }, (_, index) =>
      deed({
        outcome: index < 4 ? "done" : "abandoned",
        adopted: index === 0,
        durationDays: 100,
      })
    )
  )[0];

  it("reads out the base rate in one sentence", () => {
    const prior = priorFor(many);
    expect(prior.sentence).toContain("同类 9 件");
    expect(prior.sentence).toContain("做完 44%");
    expect(prior.sentence).toContain("有人用 11%");
  });

  it("compares your estimate against your own history", () => {
    expect(priorFor(many, 50).optimismFactor).toBe(2);
    expect(priorFor(many, 200).optimismFactor).toBe(0.5);
  });

  it("gives no factor without an estimate", () => {
    expect(priorFor(many).optimismFactor).toBeNull();
  });

  it("says so plainly when the sample is too thin", () => {
    const thin = referenceClasses([deed(), deed()])[0];
    expect(priorFor(thin).sentence).toContain(`${MIN_CLASS_SAMPLE}`);
  });
});
