import * as React from "react";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { preferenceForItem } from "@/lib/domains/signals/reading-preferences-shared";

const m = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn(), refresh: vi.fn(), setters: [] as ReturnType<typeof vi.fn>[] }));
const compiled = ts.transpileModule(readFileSync(new URL("./story-preference-buttons.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
}).outputText;

// Compile this client boundary independently: the project's Vitest setup preserves Next's JSX.
function StoryPreferenceButtons(props: { signalId: string; initial: null }): unknown {
  const modules: Record<string, unknown> = {
    react: { ...React,
      useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
      useState: (value: unknown) => { const setter = vi.fn(); m.setters.push(setter); return [value, setter]; },
      useTransition: () => [false, (action: () => unknown) => { void action(); }],
    },
    "next/navigation": { useRouter: () => ({ refresh: m.refresh }) },
    "@/components/ui/button": { Button: "button" },
    "@/lib/domains/signals/reading-preferences-shared": { preferenceForItem },
    "./reading-preferences-actions": { setReadingPreferenceAction: m.save, clearReadingPreferenceAction: m.clear },
  };
  const exports = {} as { StoryPreferenceButtons: (p: typeof props) => unknown };
  new Function("require", "exports", "React", compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected client dependency ${name}`);
    return modules[name];
  }, exports, React);
  return exports.StoryPreferenceButtons(props);
}

function buttons(node: unknown): { children?: unknown; onClick?: () => unknown }[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  const props = (node as { props?: { children?: unknown; onClick?: () => unknown } }).props;
  if (!props) return [];
  return [...(props.onClick ? [props] : []), ...buttons(props.children)];
}

beforeEach(() => { vi.clearAllMocks(); m.setters.length = 0; });

describe("reading preference save lifecycle", () => {
  it("holds an explicit busy flag until the asynchronous save settles and ignores duplicate clicks", async () => {
    let finish!: (value: unknown) => void;
    m.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const tree = StoryPreferenceButtons({ signalId: "signal", initial: null });
    const follow = buttons(tree).find((b) => b.children === "关注这件事")!;
    follow.onClick!(); follow.onClick!();
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.setters.some((setter) => setter.mock.calls.some(([value]) => value === true))).toBe(true);
    expect(m.setters.some((setter) => setter.mock.calls.some(([value]) => value === false))).toBe(false);
    finish({ ok: true, state: { status: "ready", preferences: [] } });
    await vi.waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(1));
    expect(m.setters.some((setter) => setter.mock.calls.some(([value]) => value === false))).toBe(true);
  });
  it("releases the lock after an error so the user can retry", async () => {
    m.save.mockRejectedValueOnce(new Error("network failed")).mockResolvedValueOnce({ ok: false, message: "retry later" });
    const tree = StoryPreferenceButtons({ signalId: "signal", initial: null });
    const follow = buttons(tree).find((b) => b.children === "关注这件事")!;
    follow.onClick!();
    await vi.waitFor(() => expect(m.setters.some((setter) => setter.mock.calls.some(([value]) => value === false))).toBe(true));
    follow.onClick!();
    await vi.waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
