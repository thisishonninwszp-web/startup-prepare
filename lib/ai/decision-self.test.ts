import { describe, expect, it, vi } from "vitest";
const gateway = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./reality", () => ({ generateRealityJson: gateway.run }));
import { challengeWithSelf } from "./decision-self";
import type { SelfRecord } from "@/lib/domains/decision-self/domain";

describe("challenge with selected self records", () => {
  it("sends only selected context with attribution and correction instructions", async () => {
    const record: SelfRecord = { type: "self_deeds", id: "a", title: "访谈", date: "2026-09-01", text: "联系了两人", href: "/self/records/self_deeds/a" };
    gateway.run.mockResolvedValue({ questions: [] });
    await challengeWithSelf("准备做一个访谈工具", [record]);
    const [system, content, validate] = gateway.run.mock.calls.at(-1)!;
    expect(system).toContain("不得引用本次未提供");
    expect(system).toContain("能推翻质疑");
    expect(content).toContain("联系了两人");
    expect(content).toContain("准备做一个访谈工具");
    expect(() => validate({ questions: [{ question: "为什么？", sourceIds: ["invented"], wouldChange: "去访谈" }] })).toThrow();
  });
  it("does not call AI with no records", async () => {
    gateway.run.mockClear();
    await expect(challengeWithSelf("想法", [])).rejects.toThrow();
    expect(gateway.run).not.toHaveBeenCalled();
  });
});
