import type { ItemFlow } from "./flow-shared";

/**
 * 邮件里的一图看懂：发邮件的那一边（定时任务，Node）把标题和四个框签上名，交给 Edge 路由 /api/flow-card 画成 PNG。
 * 路由只画签过名的内容，免得谁都能拿它画任意文字。签名用 CRON_SECRET 做 HMAC-SHA256（Web Crypto，Node 和 Edge 都有）。
 */
export type FlowCardData = { headline: string; flow: ItemFlow };

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function signFlowCard(data: FlowCardData, secret: string): Promise<{ d: string; s: string }> {
  const d = toBase64Url(new TextEncoder().encode(JSON.stringify(data)));
  return { d, s: await hmac(secret, d) };
}

/** 签名对不上、内容不像一张卡片，都返回 null。 */
export async function readFlowCard(d: string, s: string, secret: string): Promise<FlowCardData | null> {
  if (!d || !s || !secret || (await hmac(secret, d)) !== s) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromBase64Url(d))) as FlowCardData;
    return typeof v?.headline === "string" && v.flow && typeof v.flow.event === "string" ? v : null;
  } catch {
    return null;
  }
}
