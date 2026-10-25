import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// The repository preserves JSX for Next; compile the real module for the request-gate tests without rendering UI.
const source = readFileSync(new URL("./judgment-updates-panel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported: Record<string, unknown> = {};
runInNewContext(compiled, { exports: exported, require: () => ({}), Intl });
const runJudgmentTask = exported.runJudgmentTask as (gate: { current: boolean }, setBusy: (busy: boolean) => void, task: () => Promise<void>) => Promise<void>;

describe("judgment panel pending requests", () => {
  it("keeps the task busy through the awaited request and ignores a repeat click", async () => {
    let finish!: () => void;
    const request = new Promise<void>((resolve) => { finish = resolve; });
    const action = vi.fn(() => request);
    const setBusy = vi.fn();
    const gate = { current: false };
    const first = runJudgmentTask(gate, setBusy, action);
    const repeated = runJudgmentTask(gate, setBusy, action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(gate.current).toBe(true);
    expect(setBusy.mock.calls).toEqual([[true]]);
    finish();
    await Promise.all([first, repeated]);
    expect(gate.current).toBe(false);
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("unlocks after a request fails so a real retry can run", async () => {
    const gate = { current: false };
    const setBusy = vi.fn();
    await expect(runJudgmentTask(gate, setBusy, async () => { throw new Error("network failed"); })).rejects.toThrow("network failed");
    const retry = vi.fn(async () => {});
    await runJudgmentTask(gate, setBusy, retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(setBusy.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it("does not block an independent evidence check while a history entry is saving", async () => {
    let finish!: () => void;
    const saveGate = { current: false };
    const evidenceGate = { current: false };
    const saving = runJudgmentTask(saveGate, vi.fn(), () => new Promise<void>((resolve) => { finish = resolve; }));
    const check = vi.fn(async () => {});
    await runJudgmentTask(evidenceGate, vi.fn(), check);
    expect(check).toHaveBeenCalledTimes(1);
    expect(saveGate.current).toBe(true);
    finish();
    await saving;
  });
});
