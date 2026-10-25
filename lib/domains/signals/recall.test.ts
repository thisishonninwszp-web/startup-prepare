import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), followed: vi.fn(), marks: vi.fn(), preferences: vi.fn(), events: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from } }));
vi.mock("./memory", () => ({ followedSignals: m.followed, marksFor: m.marks, storyAround: vi.fn() }));
vi.mock("./reading-preferences", () => ({ loadReadingPreferences: m.preferences, reportEventsForSignals: m.events }));
import { dueRecalls } from "./recall";

function query(result: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), lte: vi.fn(), order: vi.fn(), limit: vi.fn(), range: vi.fn(), delete: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const method of [q.select, q.eq, q.lte, q.order, q.limit, q.range, q.delete]) method.mockReturnValue(q);
  return q;
}
const row = (signal_id: string) => ({ signal_id, due_on: "2026-10-24", reviews: 1, external_signals: { title: signal_id, fetched_at: "2026-10-01T00:00:00Z" } });
beforeEach(() => {
  vi.clearAllMocks();
  m.followed.mockResolvedValue([]); m.marks.mockResolvedValue(new Map());
  m.preferences.mockResolvedValue({ status: "ready", preferences: [] }); m.events.mockResolvedValue(new Map());
});

describe("静音已有回想", () => {
  it("按读者的事件静音过滤已排期记录，先过滤再限额且总数一致", async () => {
    const sync = query({ data: [], error: null });
    const due = query({ data: [row("muted-same-event"), row("visible-a"), row("visible-b")], error: null, count: 3 });
    m.from.mockReturnValueOnce(sync).mockReturnValueOnce(due);
    m.preferences.mockResolvedValue({ status: "ready", preferences: [{
      signal_id: "older-anchor", event_key: "event:日银加息", event_label: "日银加息", preference: "mute",
      created_at: "2026-10-01", updated_at: "2026-10-25", title: "旧新闻",
    }] });
    m.events.mockResolvedValue(new Map([["muted-same-event", "日银加息后银行跟进"]]));
    const result = await dueRecalls("viewer", true, "2026-10-25", 1);
    expect(result).toMatchObject({ total: 2, items: [{ signal_id: "visible-a" }] });
    expect(m.preferences).toHaveBeenCalledWith("viewer");
    expect(m.events).toHaveBeenCalledWith("viewer", ["muted-same-event", "visible-a", "visible-b"]);
    expect(m.followed).toHaveBeenCalledWith("viewer", true);
    expect(due.eq).toHaveBeenCalledWith("user_id", "viewer");
    expect(sync.delete).not.toHaveBeenCalled(); expect(due.delete).not.toHaveBeenCalled();
  });

  it("所有到期记录静音后不再显示提醒，取消静音仍能恢复历史", async () => {
    m.preferences.mockResolvedValue({ status: "ready", preferences: [{
      signal_id: "muted", event_key: "signal:muted", event_label: null, preference: "mute",
      created_at: "2026-10-01", updated_at: "2026-10-25", title: "旧新闻",
    }] });
    m.from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(query({ data: [row("muted")], error: null }));
    expect(await dueRecalls("viewer", false, "2026-10-25")).toEqual({ total: 0, items: [] });
    m.preferences.mockResolvedValue({ status: "ready", preferences: [] });
    m.from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(query({ data: [row("muted")], error: null }));
    expect(await dueRecalls("viewer", false, "2026-10-25")).toMatchObject({ total: 1, items: [{ signal_id: "muted" }] });
  });
});
