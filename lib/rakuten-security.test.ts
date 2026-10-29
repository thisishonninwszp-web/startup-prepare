import { afterEach, describe, expect, it, vi } from "vitest";
import { rakutenItemSearch, rakutenRequest } from "./rakuten";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("safe Rakuten transport", () => {
  it("redacts echoed credentials recursively and sends access key only as header", async () => {
    vi.stubEnv("RAKUTEN_APPLICATION_ID", "sensitive-app"); vi.stubEnv("RAKUTEN_ACCESS_KEY", "sensitive-key");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Items: [{ itemName: "sensitive-key", nested: { url: "sensitive-app" } }] })));
    vi.stubGlobal("fetch", fetcher);
    const result = await rakutenItemSearch({ keyword: "茶", accessKey: "override", applicationId: "override" });
    expect(JSON.stringify(result)).not.toMatch(/sensitive-key|sensitive-app/);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("accessKey"); expect(new URL(url).searchParams.get("applicationId")).toBe("sensitive-app");
    expect(options.redirect).toBe("error"); expect(options.headers).toMatchObject({ accessKey: "sensitive-key" });
  });
  it("checks authorization before HTTP and never retries denial", async () => {
    vi.stubEnv("RAKUTEN_APPLICATION_ID", "sensitive-app"); vi.stubEnv("RAKUTEN_ACCESS_KEY", "sensitive-key");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const result = await rakutenRequest("ranking", {}, { beforeRequest: async () => { throw new Error("denied sensitive-key"); } });
    expect(result).toHaveProperty("error"); expect(JSON.stringify(result)).not.toContain("sensitive-key"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects oversized and failed responses without exposing their body", async () => {
    vi.stubEnv("RAKUTEN_APPLICATION_ID", "sensitive-app"); vi.stubEnv("RAKUTEN_ACCESS_KEY", "sensitive-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive-key", { status: 403 })));
    expect(await rakutenItemSearch({ keyword: "茶" })).toEqual({ error: "楽天返回 403" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(200))));
    expect(await rakutenRequest("search", {}, { maxResponseBytes: 20 })).toHaveProperty("error");
  });
});
