import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// 模拟：access token 过期了，getUser() 顺手换了一对新的 token，经 setAll 写回。
const refreshed = vi.hoisted(() => ({
  user: { id: "u1", email: "owner@example.com" } as { id: string; email: string } | null,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: { name: string; value: string; options: Record<string, unknown> }[],
          headers: Record<string, string>
        ) => void;
      };
    }
  ) => ({
    auth: {
      getUser: async () => {
        options.cookies.setAll(
          [{ name: "sb-test-auth-token", value: "new-refresh", options: { path: "/", sameSite: "lax" } }],
          { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" }
        );
        return { data: { user: refreshed.user } };
      },
    },
  }),
}));

import { middleware } from "./middleware";

function request(path: string) {
  return new NextRequest(new URL(path, "https://ideaos.example"), {
    headers: { cookie: "sb-test-auth-token=old-refresh" },
  });
}

describe("middleware 换了新 token 之后", () => {
  beforeEach(() => {
    refreshed.user = { id: "u1", email: "owner@example.com" };
    vi.stubEnv("IDEAOS_USER_EMAIL", "");
    vi.stubEnv("IDEAOS_MEMBERS", "");
  });

  it("从 / 跳到 /dashboard 时把新 token 带上（不然浏览器留着用过的那个，下次就被登出）", async () => {
    const response = await middleware(request("/"));
    expect(response.headers.get("location")).toBe("https://ideaos.example/dashboard");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new-refresh");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("不在名单上的账号跳到 /not-member 时也带上", async () => {
    vi.stubEnv("IDEAOS_USER_EMAIL", "someone-else@example.com");
    const response = await middleware(request("/capture"));
    expect(response.headers.get("location")).toBe("https://ideaos.example/not-member");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new-refresh");
  });

  it("不跳转的请求照旧带上新 token 和不许缓存的头", async () => {
    const response = await middleware(request("/capture"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new-refresh");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
