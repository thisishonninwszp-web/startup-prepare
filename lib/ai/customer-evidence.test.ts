import { beforeEach, describe, expect, it, vi } from "vitest";

// 提取证据时，商家的介绍和广告、在材料里逐字找不到的原话都不能当成顾客的话存下来。

const gateway = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock("./reality", () => ({ generateRealityJson: gateway.json }));

import { extractCustomerEvidence } from "./customer";

const interview = {
  id: "interview",
  title: "同僚への聞き取り",
  source: "user",
  text: "朝は時間がなくて、クリーニング屋が開く前に家を出る。結局、週末にまとめて持っていくしかない。",
};

const vendor = {
  id: "vendor",
  title: "宅配クリーニング",
  source: "example.com",
  text: "忙しいあなたに。24時間いつでも玄関先で受け取れます。お客様の声：本当に楽になりました！",
};

function atom(material_id: string, quote: string, speaker?: string) {
  return {
    material_id,
    speaker,
    quote,
    scene: "出勤前",
    behavior: "週末にまとめて出す",
    alternative: "",
    tradeoff: "",
    emotion: "",
    emotion_basis: "unknown",
  };
}

beforeEach(() => {
  gateway.json.mockReset();
});

describe("extractCustomerEvidence", () => {
  it("keeps only the customer's own words that are in the material", async () => {
    gateway.json.mockImplementation(async (_system, _content, parse) =>
      parse({
        atoms: [
          atom("interview", "週末にまとめて持っていくしかない", "customer"),
          atom("vendor", "24時間いつでも玄関先で受け取れます", "seller"),
          atom("vendor", "本当に楽になりました！", "seller"),
          atom("interview", "平日は取りに行く時間がない", "customer"),
        ],
      })
    );

    const atoms = await extractCustomerEvidence([interview, vendor]);

    expect(atoms.map((item) => item.quote)).toEqual([
      "週末にまとめて持っていくしかない",
    ]);
    const system = gateway.json.mock.calls[0][0] as string;
    expect(system).toContain("speaker");
    expect(system).toContain("一字不改");
  });

  it("keeps nothing from a page the AI says is the seller's own", async () => {
    const testimonials = {
      ...vendor,
      text: `${vendor.text}\n初めての利用でしたが、コートが蘇った感じで満足しています。`,
    };
    gateway.json.mockImplementation(async (_system, _content, parse) =>
      parse({
        pages: [
          { material_id: "vendor", kind: "seller" },
          { material_id: "interview", kind: "community" },
        ],
        atoms: [
          atom("vendor", "初めての利用でしたが、コートが蘇った感じで満足しています。", "customer"),
          atom("interview", "週末にまとめて持っていくしかない", "customer"),
        ],
      })
    );

    const atoms = await extractCustomerEvidence([interview, testimonials]);

    expect(atoms.map((item) => item.material_id)).toEqual(["interview"]);
    expect(gateway.json.mock.calls[0][0]).toContain("pages");
  });

  it("only checks quotes against the part of the material the AI was shown", async () => {
    const long = {
      ...interview,
      text: `${"あ".repeat(8000)}平日は取りに行く時間がない`,
    };
    gateway.json.mockImplementation(async (_system, content, parse) => {
      expect(content).not.toContain("平日は取りに行く時間がない");
      return parse({
        atoms: [atom("interview", "平日は取りに行く時間がない", "customer")],
      });
    });

    await expect(extractCustomerEvidence([long])).resolves.toEqual([]);
  });

  it("still refuses atoms that point at a material it was not given", async () => {
    gateway.json.mockImplementation(async (_system, _content, parse) =>
      parse({ atoms: [atom("other", "週末にまとめて持っていくしかない", "customer")] })
    );

    await expect(extractCustomerEvidence([interview])).rejects.toThrow(
      "未被允许的材料"
    );
  });
});
