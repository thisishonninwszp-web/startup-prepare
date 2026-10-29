import { describe, expect, it } from "vitest";
import { checkWindow, isPublicAddress, validateWindowUrl, type WindowDependencies } from "./windows";

const response = (body: string, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) => ({ status, headers, body: Buffer.from(body) });
function dependencies(overrides: Partial<WindowDependencies> = {}): WindowDependencies {
  return { resolve: async () => [{ address: "93.184.216.34", family: 4 }], request: async () => response("<p>Price is $42 for a real product.</p>"), now: () => new Date("2026-10-25T10:00:00Z"), ...overrides };
}
describe("public window URLs", () => {
  it.each(["http://localhost", "http://127.1", "http://2130706433", "http://169.254.169.254/latest", "http://[::1]", "http://[::ffff:127.0.0.1]", "file:///tmp/a", "https://u:p@example.com"])('rejects %s', url => expect(() => validateWindowUrl(url)).toThrow());
  it.each(["10.0.0.1", "172.16.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "fe80::1", "fc00::1", "::ffff:a00:1", "2001:db8::1"])("blocks address %s", value => expect(isPublicAddress(value)).toBe(false));
  it("rejects mixed public/private DNS before network access", async () => {
    let requested = false;
    const result = await checkWindow("https://example.com", "", dependencies({ resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "::ffff:10.0.0.1", family: 6 }], request: async () => { requested = true; return response("x"); } }));
    expect(result.status).toBe("failed"); expect(requested).toBe(false);
  });
  it("checks redirects before sending another request", async () => {
    let calls = 0;
    const result = await checkWindow("https://example.com", "", dependencies({ request: async () => { calls++; return response("", 302, { location: "http://127.0.0.1/" }); } }));
    expect(result.status).toBe("failed"); expect(calls).toBe(1);
  });
  it("pins validated DNS address into the network adapter", async () => {
    let pinned = "";
    await checkWindow("https://example.com", "", dependencies({ request: async (_url, address) => { pinned = address.address; return response("A sufficiently long plain text observation.", 200, { "content-type": "text/plain" }); } }));
    expect(pinned).toBe("93.184.216.34");
  });
});
describe("window observations", () => {
  it("records exact nearby text and a stable hash, never inferred values", async () => {
    const result = await checkWindow("https://example.com", "$42", dependencies());
    expect(result.status).toBe("success"); expect(result.excerpt).toContain("$42"); expect(result.hash).toMatch(/^[a-f0-9]{64}$/); expect(result.value).toBe("找到原文标记：$42");
  });
  it("reports a missing marker explicitly", async () => expect((await checkWindow("https://example.com", "missing", dependencies())).value).toBe("未找到原文标记：missing"));
  it.each([response("Oops", 500), response("pdf", 200, { "content-type": "application/pdf" }), response("x".repeat(1048577))])("records unsupported/error/oversized responses as failures", async reply => expect((await checkWindow("https://example.com", "", dependencies({ request: async () => reply }))).status).toBe("failed"));
  it("records timeout errors as failures", async () => {
    const result = await checkWindow("https://example.com", "", dependencies({ request: async () => { throw new Error("请求超时（8 秒）"); } }));
    expect(result.status).toBe("failed"); expect(result.error).toContain("超时");
  });
  it("bounds redirect chains", async () => {
    let calls = 0;
    const result = await checkWindow("https://example.com", "", dependencies({ request: async () => { calls++; return response("", 302, { location: "/again" }); } }));
    expect(result.status).toBe("failed"); expect(calls).toBe(4);
  });
});


it("enforces the eight-second deadline even while DNS is unresolved", async () => {
  const { vi } = await import("vitest");
  vi.useFakeTimers();
  try {
    const pending = checkWindow("https://example.com", "", dependencies({ resolve: () => new Promise(() => {}) }));
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ status: "failed", error: "请求超时（8 秒）。" });
  } finally { vi.useRealTimers(); }
});
it("rejects a redirect whose new DNS answer is private", async () => {
  let calls = 0;
  const result = await checkWindow("https://example.com", "", dependencies({ resolve: async hostname => [{ address: hostname === "example.com" ? "93.184.216.34" : "10.1.2.3", family: 4 }], request: async () => { calls++; return response("", 302, { location: "https://private.example.com" }); } }));
  expect(result.status).toBe("failed"); expect(calls).toBe(1);
});

it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"])("allows global address %s", address => expect(isPublicAddress(address)).toBe(true));
it("ignores script text when looking for an observation marker", async () => {
  const result = await checkWindow("https://example.com", "fake price", dependencies({ request: async () => response('<script>fake price</script><p>This is the actual public observation from the page.</p>') }));
  expect(result.value).toBe("未找到原文标记：fake price"); expect(result.excerpt).not.toContain("fake price");
});
