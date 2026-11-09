import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedEmail } from "./lib/members";

/**
 * Refreshes the Supabase auth session on every request and guards routes:
 *  - unauthenticated users are redirected to /login
 *  - authenticated users hitting / or /login are sent to /dashboard
 */
/**
 * 不靠登录态、自己验口令的接口：定时任务（CRON_SECRET）、手机分享（SHARE_TOKEN）、公开对账页和假门测试页（地址里的随机口令）。
 * 它们没有登录 cookie，不放行就会被跳到 /login —— 定时任务就是这样一直没跑起来的。
 * 一图看懂的卡片（/api/flow-card）靠 CRON_SECRET 签名，发邮件时由服务器去取，也没有登录 cookie。
 */
// 邮件里「点一下就完成」的链接（/a/<口令>）也是：口令里签着是谁，见 lib/action-links.ts
const TOKEN_AUTH_PREFIXES = ["/api/cron/", "/api/share", "/api/flow-card", "/record/", "/soon/", "/a/"];

export async function middleware(request: NextRequest) {
  if (TOKEN_AUTH_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  let supabaseResponse = NextResponse.next({ request });
  // @supabase/ssr 写登录 cookie 时一起给的「别缓存」头：带着 token 的响应被 CDN 缓存，会把一个人的登录发给另一个人。
  let authHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          authHeaders = headers ?? {};
          Object.entries(authHeaders).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // getUser() 可能刚用掉旧的 refresh token、换了新的。跳转的响应是另起的，不把新 cookie 抄过去，
  // 浏览器就还拿着用过的那个，过了 Supabase 的重用窗口再来就是 refresh_token_already_used，人被登出。
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    Object.entries(authHeaders).forEach(([key, value]) =>
      response.headers.set(key, value)
    );
    return response;
  };

  if (!user && pathname !== "/login") return redirectTo("/login");

  // 不在使用名单上的账号（配了 IDEAOS_USER_EMAIL / IDEAOS_MEMBERS 时）：哪里都去不了，只停在「还没对你开放」。
  // server action 走的是页面地址的 POST，也会在这里被拦下 —— 陌生人注册了也花不了 AI 的钱。
  if (user && !isAllowedEmail(user.email)) {
    if (pathname === "/not-member") return supabaseResponse;
    return redirectTo("/not-member");
  }
  if (user && pathname === "/not-member") return redirectTo("/dashboard");

  if (user && (pathname === "/login" || pathname === "/")) return redirectTo("/dashboard");

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets so the session is refreshed
     * on every navigable page.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
