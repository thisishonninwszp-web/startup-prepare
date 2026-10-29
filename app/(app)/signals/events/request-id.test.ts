import { expect, it, vi } from "vitest";
import { eventRequest } from "./request-id";

it("retains identity across retries without storing private payloads, and clears only on success", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const payload = { eventId: "event", note: "private note", quote: "private quote" };
  const first = await eventRequest("include", payload, storage);
  vi.resetModules();
  const reloaded = await import("./request-id");
  expect((await reloaded.eventRequest("include", payload, storage)).requestId).toBe(first.requestId);
  expect(JSON.stringify([...values])).not.toMatch(/private|eventId/);
  expect((await eventRequest("include", { ...payload, note: "changed" }, storage)).requestId).not.toBe(first.requestId);
  first.complete();
  expect((await eventRequest("include", payload, storage)).requestId).not.toBe(first.requestId);
});
