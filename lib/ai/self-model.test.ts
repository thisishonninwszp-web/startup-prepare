import { describe, expect, it, vi } from "vitest";

const generateRealityJson = vi.fn();
vi.mock("./reality", () => ({ generateRealityJson }));

const { nominateDispositions, existingDispositionNames } = await import(
  "./self-model"
);

async function nominate(payload: unknown) {
  generateRealityJson.mockImplementationOnce(
    async (_system: string, _contents: string, parse: (v: unknown) => unknown) =>
      parse(payload)
  );
  return nominateDispositions({
    claimed: [],
    declarations: [],
    existingNames: existingDispositionNames(),
  });
}

const good = {
  name: "边走边想",
  axis: "attention",
  claim: "坐着想不出来，走一走就通了",
  test: "散步之后的一小时里，写下的想法数量",
  because: "你认领了怕被打断",
};

describe("nominateDispositions", () => {
  it("keeps a well-formed nomination", async () => {
    expect(await nominate({ nominations: [good] })).toEqual([good]);
  });

  it("drops anything without a way to check it", async () => {
    // 没有验法的气质就只是一个形容词 —— prompt 里说了，这里再挡一次。
    expect(await nominate({ nominations: [{ ...good, test: "" }] })).toEqual([]);
    expect(await nominate({ nominations: [{ ...good, test: "会的" }] })).toEqual([]);
  });

  it("drops praise and anything with a number in it", async () => {
    expect(
      await nominate({ nominations: [{ ...good, claim: "我非常擅长这个" }] })
    ).toEqual([]);
    expect(
      await nominate({ nominations: [{ ...good, name: "INTP 型" }] })
    ).toEqual([]);
    expect(
      await nominate({ nominations: [{ ...good, name: "80分选手" }] })
    ).toEqual([]);
  });

  it("drops an unknown axis", async () => {
    expect(await nominate({ nominations: [{ ...good, axis: "vibes" }] })).toEqual(
      []
    );
  });

  it("caps the list and survives junk", async () => {
    // 名字里不能有数字（那条规则就是用来挡「80分选手」的），所以用汉字编号。
    const labels = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉".split("");
    const many = labels.map((label) => ({ ...good, name: `候选${label}` }));
    expect(await nominate({ nominations: many })).toHaveLength(6);
    expect(await nominate({})).toEqual([]);
    expect(await nominate({ nominations: "nope" })).toEqual([]);
  });

  it("hands the model the existing names so it does not repeat them", () => {
    expect(existingDispositionNames()).toContain("独处充电");
    expect(existingDispositionNames().length).toBeGreaterThan(40);
  });
});
