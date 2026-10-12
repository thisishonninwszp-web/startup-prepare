import { describe, expect, it } from "vitest";
import { READER_RULES, renderContextFiles, renderIdea, searchContext, slugify, type ContextData, type ContextIdea } from "./render";

const idea = (over: Partial<ContextIdea> = {}): ContextIdea => ({
  id: "11111111-aaaa",
  title: "给便利店做排班",
  status: "验证中",
  tags: [],
  hypothesis: { target_user: "便利店店长", pain: "排班靠手写" },
  created_at: "2026-09-01T00:00:00Z",
  last_activity_at: "2026-09-05T00:00:00Z",
  validations: [],
  predictions: [],
  decisions: [],
  exits: [],
  ...over,
});

const data = (over: Partial<ContextData> = {}): ContextData => ({
  exported_at: "2026-10-12T10:00:00Z",
  ideas: [idea()],
  observations: [{ id: "o1", raw_text: "店长说排班最头疼的是临时请假", tags: [], created_at: "2026-09-02T00:00:00Z" }],
  materials: [],
  judgments: [],
  questions: [],
  ...over,
});

describe("给外面的 AI 读的导出", () => {
  it("没验证过的想法直说没问过真人，空着的假设格写空着", () => {
    const md = renderIdea(idea());
    expect(md).toContain("一共 0 次");
    expect(md).toContain("没去问过任何一个真人");
    expect(md).toContain("替代方案：（空着）");
    expect(md).toContain("目标用户：便利店店长");
  });

  it("验证记录把 yes/no/unsure 写成中文", () => {
    const md = renderIdea(idea({ validations: [{ has_pain: "yes", will_pay: "unsure", note: "问了 3 家店", contacted_at: "2026-09-03T00:00:00Z" }] }));
    expect(md).toContain("2026-09-03：有真实痛？是；愿付钱？不确定。记录：问了 3 家店");
  });

  it("文件夹第一页是规矩；同名想法不会互相覆盖", () => {
    const files = renderContextFiles(data({ ideas: [idea(), idea({ id: "22222222-bbbb" })] }));
    expect(files[0].path).toBe("README.md");
    expect(files[0].content.startsWith(READER_RULES)).toBe(true);
    const ideaPaths = files.filter((f) => f.path.startsWith("ideas/")).map((f) => f.path);
    expect(new Set(ideaPaths).size).toBe(2);
  });

  it("文件名去掉 Windows 不认的字符，没标题用编号", () => {
    expect(slugify('a/b:c*d?"e', "x")).toBe("a-b-c-d-e");
    expect(slugify(null, "abc123")).toBe("abc123");
  });

  it("搜索给出处和上下文，不分大小写", () => {
    const hits = searchContext(data(), "临时请假");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("观察 2026-09-02（o1）");
    expect(searchContext(data(), "")).toEqual([]);
  });
});
