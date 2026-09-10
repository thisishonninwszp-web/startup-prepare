import { describe, expect, it, vi } from "vitest";
const gateway = vi.hoisted(() => ({ json: vi.fn(), text: vi.fn() }));
vi.mock("./reality", () => ({ generateRealityJson: gateway.json }));
vi.mock("./shared", () => ({ MODEL: "test", generateContent: gateway.text }));
import { challenge } from "./core";
import type { SelfRecord } from "@/lib/domains/decision-self/domain";

describe("role challenge source validation", () => {
  it("rejects unselected sources in an existing role conversation", async () => {
    gateway.text.mockResolvedValue({ text: "你具体遇到什么问题？" });
    gateway.json.mockImplementation(async (_system, _content, validate) => validate({ questions: [{ question: "为什么？", sourceIds: ["fabricated"], wouldChange: "真实接触" }] }));
    const record: SelfRecord = { type: "self_deeds", id: "a", title: "访谈", date: "2026-09-01", text: "访谈过两人", href: "/self/records/self_deeds/a" };
    await expect(challenge("operator", "当前想法", [], [record])).rejects.toThrow();
    expect(gateway.json).toHaveBeenCalled();
  });
  it("does not accept self citations when no records are selected", async () => {
    gateway.text.mockResolvedValue({ text: "你之前在 /self/records/self_deeds/foreign 里说过" });
    await expect(challenge("operator", "当前想法", [], [])).rejects.toThrow();
  });
});
