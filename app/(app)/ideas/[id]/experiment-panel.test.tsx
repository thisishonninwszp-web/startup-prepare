import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../experiment-actions", () => ({ loadExperimentsAction: vi.fn() }));
import { ExperimentPanel, ExperimentBoundaryView } from "./experiment-panel";
import { loadExperimentsAction } from "../experiment-actions";

it("does not load private samples before explicit open", () => {
  const html = renderToStaticMarkup(<ExperimentPanel ideaId="idea" gapId="gap" question="接待任务是什么" />);
  expect(html).toContain("暂时接触不到人，也能核对什么");
  expect(loadExperimentsAction).not.toHaveBeenCalled();
});
it("shows unresolved customer questions separately from technical outcomes", () => {
  const html = renderToStaticMarkup(<ExperimentBoundaryView boundary={{ checked: ["所选输入已运行"], stillUnknown: ["痛点和付费仍未知"], nextQuestions: ["向经营者核对任务"], demandConclusion: "unresolved" }} />);
  expect(html).toContain("所选输入已运行");
  expect(html).toContain("痛点和付费仍未知");
  expect(html).toContain("向经营者核对任务");
  expect(html).toContain("真实验证");
});
