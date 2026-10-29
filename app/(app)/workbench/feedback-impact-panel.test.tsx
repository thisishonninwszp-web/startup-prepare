import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../ideas/feedback-actions", () => ({ loadFeedbackAction: vi.fn() }));
vi.mock("./feedback-task-panel", () => ({ FeedbackTaskPanel: () => null }));
import { FeedbackImpactPanel, FeedbackSourceView } from "./feedback-impact-panel";
import { loadFeedbackAction } from "../ideas/feedback-actions";

it("does not load private feedback before the user opens the panel", () => {
  expect(renderToStaticMarkup(<FeedbackImpactPanel ideaId="idea" />)).toContain("反馈与适用范围");
  expect(loadFeedbackAction).not.toHaveBeenCalled();
});
it("labels validation notes as notes and keeps copied signals readonly", () => {
  const html = renderToStaticMarkup(<FeedbackSourceView sourceKind="validation" sourceNote="访谈备注" verbatim={false} roleContext="小旅馆" interpretation="我的解释" hasPain="yes" willPay="unsure" />);
  expect(html).toContain("既有验证备注");
  expect(html).not.toContain("客户逐字原话");
  expect(html).toContain("我的解释");
  expect(html).toContain("只读");
  expect(html).not.toContain("<select");
});
it("keeps no reply distinct from a negative demand signal", () => {
  const html = renderToStaticMarkup(<FeedbackSourceView sourceKind="no_reply" sourceNote="三天未回复" verbatim={false} roleContext="店长" interpretation="渠道仍未知" />);
  expect(html).toContain("无回复不表示没有需求");
  expect(html).toContain("痛点 / 付费仍未知");
});
