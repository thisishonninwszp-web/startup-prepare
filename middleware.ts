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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 不在使用名单上的账号（配了 IDEAOS_USER_EMAIL / IDEAOS_MEMBERS 时）：哪里都去不了，只停在「还没对你开放」。
  // server action 走的是页面地址的 POST，也会在这里被拦下 —— 陌生人注册了也花不了 AI 的钱。
  if (user && !isAllowedEmail(user.email)) {
    if (pathname === "/not-member") return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = "/not-member";
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/not-member") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

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
