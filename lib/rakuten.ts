/** Official Rakuten transport shared by legacy search and business material providers. */
const ENDPOINTS = {
  search: "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701",
  ranking: "https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601",
} as const;

export function rakutenKeys(): { applicationId: string; accessKey: string } | null {
  const applicationId = (process.env.RAKUTEN_APPLICATION_ID || process.env.RAKUTEN_APP_ID || "").trim();
  const accessKey = (process.env.RAKUTEN_ACCESS_KEY || "").trim();
  return applicationId && accessKey ? { applicationId, accessKey } : null;
}

export function rakutenReferer(raw = process.env.RAKUTEN_REFERER || process.env.APP_URL || ""): string {
  const v = raw.trim() || "https://startup-prepare.vercel.app/";
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return /^https?:\/\/[^/]+$/i.test(url) ? `${url}/` : url;
}

export interface RakutenRequestOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  beforeRequest?: () => Promise<void>;
}

function redact(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [String(redact(key, secrets)), /^(accessKey|applicationId|authorization)$/i.test(key) ? "[redacted]" : redact(entry, secrets)]));
  return value;
}

export async function rakutenRequest(kind: keyof typeof ENDPOINTS, params: Record<string, string>, options: RakutenRequestOptions = {}): Promise<unknown | "no-key" | { error: string }> {
  const keys = rakutenKeys();
  if (!keys) return "no-key";
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 8000, 30000));
  const limit = Math.max(1, Math.min(options.maxResponseBytes ?? 1_500_000, 2_000_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A denial ends this request. There is no implicit retry or unbudgeted second HTTP.
    await options.beforeRequest?.();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const referer = rakutenReferer();
    const safeParams = { ...params };
    for (const name of Object.keys(safeParams)) if (/^(applicationId|accessKey|callback|format|formatVersion)$/i.test(name)) delete safeParams[name];
    const query = new URLSearchParams({ ...safeParams, applicationId: keys.applicationId, format: "json", formatVersion: "2" });
    const res = await fetch(`${ENDPOINTS[kind]}?${query}`, { signal: controller.signal, redirect: "error", headers: { accessKey: keys.accessKey, Referer: referer, Origin: new URL(referer).origin, "User-Agent": "IdeaOS/1.0" } });
    if (!res.ok || res.redirected) { await res.body?.cancel(); return { error: `楽天返回 ${res.status}` }; }
    if (Number(res.headers.get("content-length")) > limit) { await res.body?.cancel(); return { error: "楽天响应超过大小限制" }; }
    const reader = res.body?.getReader();
    if (!reader) return { error: "楽天返回空响应" };
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) { await reader.cancel(); return { error: "楽天响应超过大小限制" }; }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const secrets = [keys.applicationId, keys.accessKey].flatMap((key) => [key, encodeURIComponent(key)]);
    const data = redact(JSON.parse(new TextDecoder().decode(bytes)), secrets);
    if (data && typeof data === "object" && "error" in data) return { error: "楽天接口返回错误" };
    return data;
  } catch {
    return { error: controller.signal.aborted ? "楽天请求超时" : "楽天请求不可用（授权、连接或响应无效）" };
  } finally { if (timer) clearTimeout(timer); }
}

/** Preserve the existing no-key / error / API response contract. */
export async function rakutenItemSearch(params: Record<string, string>, timeoutMs = 8000): Promise<unknown | "no-key" | { error: string }> {
  return rakutenRequest("search", params, { timeoutMs });
}
