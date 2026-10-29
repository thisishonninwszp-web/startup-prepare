import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Choice, ConnectedForm, Field, refreshSavedView } from "./connected-form";

it("keeps explicit labels and native constraints for manual records", () => {
  const submit = vi.fn();
  const html = renderToStaticMarkup(<ConnectedForm operation="test" submit={submit} label="保存原文"><Field name="quote" label="实际摘录" required maxLength={30000} multiline /><Field name="url" label="来源 URL" type="url" /></ConnectedForm>);
  expect(html).toContain("实际摘录");
  expect(html).toContain('maxLength="30000"');
  expect(html).toContain('type="url"');
  expect(submit).not.toHaveBeenCalled();
});

it("gives result controls an exact accessible name independent of option text", () => {
  const html = renderToStaticMarkup(<Choice name="context" label="执行 / 反馈上下文" options={[["self", "自己执行"]]} />);
  expect(html).toContain('aria-label="执行 / 反馈上下文"');
});

it("keeps a confirmed save distinct from a failing list refresh", async () => {
  const refresh = vi.fn(async () => { throw new Error("offline"); });
  expect(await refreshSavedView(refresh)).toEqual({ message: "已保存，但列表刷新未完成。请重新读取，勿重复保存。", refreshFailed: true });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(await refreshSavedView(async () => {})).toEqual({ message: "已保存。", refreshFailed: false });
});
