import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerVoices } from "./customer-voices";
import type { CustomerEvidenceAtom } from "../types";

// 「不同顾客声音」一页：分出来的声音、放到一边的证据、AI 漏掉没分的证据各自显示对不对。

const atom = (id: string, quote: string): CustomerEvidenceAtom => ({
  id,
  material_id: `m-${id}`,
  quote,
  scene: "",
  behavior: "",
  alternative: "",
  tradeoff: "",
  emotion: "",
  emotion_basis: "stated",
});

const atoms = [
  atom("owner", "閉店後に毎日30分かけて手書きの伝票を集計しています。"),
  atom("staff", "居酒屋のバイトでレジ締めを任されています。"),
  atom("contrary", "うちは小さな店なので、レジ締めは5分で終わります。"),
];

const voice = {
  key: "owner",
  label: "手で集計している店主",
  situation: "閉店後に一人で集計",
  behaviors: ["手書き伝票を足し上げる"],
  evidence_ids: ["owner"],
  unknowns: ["レジを入れない理由"],
};

function render(run: Parameters<typeof CustomerVoices>[0]["run"]) {
  return renderToStaticMarkup(
    <CustomerVoices
      run={run}
      atoms={atoms}
      busyKey={null}
      onResearch={() => {}}
      onSelectSegment={() => {}}
    />
  );
}

const baseRun = { id: "run", created_at: "2026-11-25T00:00:00Z" };

describe("CustomerVoices", () => {
  it("shows the voices, what was set aside and why, and what was left out", () => {
    const html = render({
      ...baseRun,
      evidence_ids: ["owner", "staff", "contrary", "missing"],
      segments: [voice],
      set_aside: [
        {
          evidence_id: "staff",
          reason: "other_person",
          basis: "バイト",
          note: "说话的是打工的，不是店主",
        },
      ],
    });

    expect(html).toContain("手で集計している店主");
    expect(html).toContain("用这类声音建立代理");
    expect(html).toContain('没用上的证据（<span class="font-mono">1</span>条）');
    expect(html).toContain("别的人 · 原文写着「バイト」 · 说话的是打工的，不是店主");
    expect(html).toContain("「居酒屋のバイトでレジ締めを任されています。」");
    // 没分进任何一类：只有反话那一条；找不到原话的 missing 不算进条数
    expect(html).toContain('没分进任何一类的证据（<span class="font-mono">1</span>条）');
    expect(html).toContain("「うちは小さな店なので、レジ締めは5分で終わります。」");
    expect(html).not.toContain("「閉店後に毎日30分かけて手書きの伝票を集計しています。」");
  });

  it("says plainly when no voice came out, and still lists the evidence", () => {
    const html = render({
      ...baseRun,
      evidence_ids: ["contrary"],
      segments: [],
      set_aside: [],
    });

    expect(html).toContain("这里空着：这次没分出顾客声音");
    expect(html).not.toContain("用这类声音建立代理");
    expect(html).toContain("「うちは小さな店なので、レジ締めは5分で終わります。」");
  });

  it("shows left-out evidence for older runs that had no set-aside list", () => {
    const html = render({
      ...baseRun,
      evidence_ids: ["owner", "contrary"],
      segments: [voice, { ...voice, key: "b", label: "别的一类", evidence_ids: [] }],
      set_aside: [],
    });

    expect(html).not.toContain("没用上的证据");
    expect(html).toContain("没分进任何一类的证据");
  });

  it("asks for research before there is a run", () => {
    expect(render(undefined)).toContain("先保留材料并运行研究。");
  });
});
