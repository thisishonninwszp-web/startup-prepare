import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, errors: {} as Record<string, string> }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: (table: string) => {
  const filters: Array<[string, unknown]> = [];
  let single = false;
  let operation = "read";
  let payload: Record<string, unknown>;
  const query = {
    select: () => query, order: () => query, limit: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    maybeSingle: () => { single = true; return query; },
    upsert: (value: Record<string, unknown>) => { operation = "write"; payload = value; return query; },
    delete: () => { operation = "delete"; return query; },
    then: (resolve: (result: unknown) => unknown) => {
      if (mock.errors[table]) return Promise.resolve(resolve({ data: null, error: { message: mock.errors[table] } }));
      const rows = mock.rows[table] ?? [];
      const matches = (row: Record<string, unknown>) => filters.every(([key, value]) => row[key] === value);
      if (operation === "write") rows.push(payload);
      if (operation === "delete") mock.rows[table] = rows.filter((row) => !matches(row));
      return Promise.resolve(resolve({ data: single ? rows.find(matches) ?? null : rows.filter(matches), error: null }));
    },
  };
  return query;
} } }));

import { getSelfRecord, requireSelfTarget, setSelfLink, getLinkedSelfRecords, isMissingCustomSkills } from "./queries";
const ownId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const target = { type: "idea" as const, id: ownId };
beforeEach(() => {
  mock.errors = {};
  mock.rows = {
    ideas: [{ id: ownId, user_id: "me", title: "自己的想法", status: "假设", hypothesis: {}, last_activity_at: new Date().toISOString() }, { id: otherId, user_id: "other" }],
    self_deeds: [{ id: ownId, user_id: "me", title: "访谈", occurred_on: "2026-09-01", what_happened: "联系了两人" }, { id: otherId, user_id: "other", title: "私密记录" }],
    decision_object_links: [],
  };
});
describe("self context ownership and persistence", () => {
  it("cannot read another user's source or decision", async () => {
    expect(await getSelfRecord("me", { type: "self_deeds", id: otherId })).toBeNull();
    await expect(requireSelfTarget("me", { ...target, id: otherId })).rejects.toThrow();
  });
  it("rejects foreign sources before writing a relationship", async () => {
    await expect(setSelfLink("me", target, { type: "self_deeds", id: otherId }, true)).rejects.toThrow();
    expect(mock.rows.decision_object_links).toHaveLength(0);
  });
  it("persists and removes the selected relationship without refreshing idea activity", async () => {
    const previous = mock.rows.ideas[0].last_activity_at;
    await setSelfLink("me", target, { type: "self_deeds", id: ownId }, true);
    expect((await getLinkedSelfRecords("me", target))[0].record?.title).toBe("访谈");
    await setSelfLink("me", target, { type: "self_deeds", id: ownId }, false);
    expect(await getLinkedSelfRecords("me", target)).toEqual([]);
    expect(mock.rows.ideas[0].last_activity_at).toBe(previous);
  });
  it("marks deleted sources unavailable rather than using stale content", async () => {
    await setSelfLink("me", target, { type: "self_deeds", id: ownId }, true);
    mock.rows.self_deeds = [];
    expect((await getLinkedSelfRecords("me", target))[0].record).toBeNull();
  });
  it("blocks AI after three days but permits managing records", async () => {
    mock.rows.ideas[0].status = "验证中";
    mock.rows.ideas[0].last_activity_at = "2000-01-01T00:00:00Z";
    await expect(requireSelfTarget("me", target, true)).rejects.toThrow("真实接触");
    await expect(setSelfLink("me", target, { type: "self_deeds", id: ownId }, true)).resolves.toBeUndefined();
  });
  it("surfaces a query error instead of silently dropping context", async () => {
    mock.errors.decision_object_links = "connection unavailable";
    await expect(getLinkedSelfRecords("me", target)).rejects.toThrow("connection unavailable");
  });
  it("includes the original desire and initial statement in the AI context", async () => {
    mock.rows.dream_cases = [{ id: ownId, user_id: "me", title: "下一步", context: "personal", initial_desire: "想花半年练习独立接单" }];
    mock.rows.reality_cases = [{ id: ownId, user_id: "me", title: "下一步", initial_statement: "每周加班后没有精力接单", messages: [] }];
    expect((await requireSelfTarget("me", { type: "dream_case", id: ownId }, true)).context).toContain("想花半年练习独立接单");
    expect((await requireSelfTarget("me", { type: "reality_case", id: ownId }, true)).context).toContain("每周加班后没有精力接单");
  });
  it("only tolerates the specifically missing optional skill-name table", () => {
    expect(isMissingCustomSkills({ code: "PGRST205", message: "public.self_custom_skills missing" })).toBe(true);
    expect(isMissingCustomSkills({ code: "PGRST205", message: "public.self_skill_nodes missing" })).toBe(false);
    expect(isMissingCustomSkills({ code: "42501", message: "self_custom_skills permission denied" })).toBe(false);
  });
});
