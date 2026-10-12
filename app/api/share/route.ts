import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { pickUrl, saveTextMaterial, saveUrlMaterial } from "@/app/(app)/materials/ingest";

/**
 * 手机分享进材料箱：iPhone 用"快捷指令"、或者任何能发 HTTP 请求的东西，把网址或一段文字送进来。
 * 没有登录态，靠口令认人：
 *   SHARE_TOKEN       口令（自己生成一串够长的随机字符，填进 Vercel 环境变量和快捷指令）
 *   SHARE_USER_EMAIL  存进谁的材料箱（你登录 IdeaOS 用的邮箱）
 * 两个都没配就整个接口关着。
 *
 * POST JSON：{ "url": "…" } 或 { "text": "…" }，可以带 { "note": "为什么存这个" }。
 * 返回一句给手机通知看的话。读网页正文要几秒，AI 审阅在后面接着跑，所以 maxDuration 给足。
 */
export const maxDuration = 60;

function tokenOk(header: string | null): boolean {
  const expected = process.env.SHARE_TOKEN;
  if (!expected || expected.length < 16 || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function shareUserId(): Promise<string | null> {
  const email = process.env.SHARE_USER_EMAIL?.toLowerCase();
  if (!email) return null;
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) return null;
  return data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

export async function POST(request: Request) {
  if (!tokenOk(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, message: "口令不对" }, { status: 401 });
  }
  const userId = await shareUserId();
  if (!userId) return NextResponse.json({ ok: false, message: "SHARE_USER_EMAIL 没配，或者找不到这个账号" }, { status: 500 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "没收到内容" }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const note = str("note").slice(0, 500);
  const text = str("text").slice(0, 50_000);
  const url = str("url") || (text && text.length < 600 ? pickUrl(text) : null);

  try {
    if (url) {
      const r = await saveUrlMaterial(userId, url, note);
      return NextResponse.json({
        ok: true,
        id: r.id,
        message: r.read ? `存进材料箱了：${r.title}` : "存了网址，但没读到正文（可能要登录）。需要的话回头把正文贴进去。",
      });
    }
    if (!text) return NextResponse.json({ ok: false, message: "没收到网址或文字" }, { status: 400 });
    const r = await saveTextMaterial(userId, note ? `${text}\n\n我为什么存这个：${note}` : text);
    return NextResponse.json({ ok: true, id: r.id, message: "存进材料箱了" });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "没存上" }, { status: 500 });
  }
}
