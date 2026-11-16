import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./list-actions", () => ({
  listConfirmAction: vi.fn(),
  listDoorDismissAction: vi.fn(),
  listDoorPublishAction: vi.fn(),
  listExperimentAction: vi.fn(),
  listJobDropAction: vi.fn(),
  listJobPickAction: vi.fn(),
  listForecastAction: vi.fn(),
  listPracticeAction: vi.fn(),
  listRecallRateAction: vi.fn(),
  listRecallRevealAction: vi.fn(),
  listResolveAction: vi.fn(),
  listResumeAction: vi.fn(),
  listSkipForecastAction: vi.fn(),
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { TodayListView } from "./list-view";

describe("一分钟清单：停了的那几样", () => {
  it("每样一行、写最后一次是哪天、一个「恢复」", () => {
    const html = renderToStaticMarkup(
      <TodayListView
        token="t"
        day="2026-11-16"
        items={[]}
        more={0}
        seconds={0}
        taps={null}
        paused={[
          { kind: "business", paused: true, lastTouch: null },
          { kind: "practice", paused: true, lastTouch: "2026-10-28T03:00:00Z" },
        ]}
      />
    );
    expect(html).toContain("这几样两周多没人点，先停了");
    expect(html).toContain("生意题");
    expect(html).toContain("一次也没点过");
    expect(html).toContain("练习的 AI 先判");
    expect(html).toContain("10 月 28 日以后没点过");
    expect(html.match(/>恢复</g)).toHaveLength(2);
  });

  it("没有停的就不出这一块", () => {
    const html = renderToStaticMarkup(<TodayListView token="t" day="2026-11-16" items={[]} more={0} seconds={0} taps={null} />);
    expect(html).not.toContain("先停了");
  });
});
