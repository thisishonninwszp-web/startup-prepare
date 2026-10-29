import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { extractArticleText } from "../rss";

type Address = { address: string; family: number };
type Reply = { status: number; headers: Record<string, string | undefined>; body: Buffer };
export type WindowDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  request: (url: URL, address: Address, signal: AbortSignal) => Promise<Reply>;
  now: () => Date;
};
export type WindowCheck = { status: "success" | "failed"; url: string; checkedAt: string; value?: string; hash?: string; excerpt?: string; error?: string };
const MAX_BYTES = 1_048_576;

export function isPublicAddress(input: string): boolean {
  const address = input.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6 || address.includes("%")) return false;
  // Only globally routable unicast IPv6 is accepted. This also rejects mapped IPv4,
  // NAT64, local, multicast, and translation/tunnel addresses carrying private IPs.
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const first = parseInt(normalized.split(":")[0], 16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff || first === 0x2002 || first === 0x3fff) return false;
  const second = parseInt(normalized.split(":")[1] || "0", 16);
  return !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8));
}

export function validateWindowUrl(input: string): URL {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || input.length > 2000) throw new Error("只支持公开 HTTP(S) 网页的标准端口，不能带账号密码。");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || !hostname.includes(".") && !isIP(hostname) || isIP(hostname) && !isPublicAddress(hostname)) throw new Error("不能访问本机、内网或云元数据地址。");
  url.hash = "";
  return url;
}

const requestPage: WindowDependencies["request"] = (url, address, signal) => new Promise((resolve, reject) => {
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  const req = transport(url, {
    signal, agent: false,
    lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    headers: { "user-agent": "IdeaOS/1.0 observation-check", accept: "text/html,text/plain", "accept-encoding": "identity" },
  }, res => {
    const chunks: Buffer[] = [];
    let size = 0;
    if (Number(res.headers["content-length"]) > MAX_BYTES) { res.destroy(); reject(new Error("网页超过 1 MB 上限。")); return; }
    res.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) { res.destroy(); reject(new Error("网页超过 1 MB 上限。")); return; }
      chunks.push(chunk);
    });
    res.on("error", reject);
    res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: { "content-type": res.headers["content-type"], "content-encoding": res.headers["content-encoding"], location: res.headers.location }, body: Buffer.concat(chunks) }));
  });
  req.on("error", reject);
  req.end();
});
const defaults: WindowDependencies = { resolve: hostname => lookup(hostname, { all: true, verbatim: true }), request: requestPage, now: () => new Date() };

export async function checkWindow(input: string, field: string, deps: WindowDependencies = defaults): Promise<WindowCheck> {
  const checkedAt = deps.now().toISOString();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("请求超时（8 秒）。")); }, 8000); });
    const operation = async (): Promise<WindowCheck> => {
      let url = validateWindowUrl(input);
      for (let redirects = 0; redirects <= 3; redirects++) {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await deps.resolve(hostname);
        if (!addresses.length || addresses.some(value => !isPublicAddress(value.address))) throw new Error("域名解析包含非公开地址，已停止检查。");
        if (controller.signal.aborted) throw new Error("请求超时（8 秒）。");
        const reply = await deps.request(url, addresses[0], controller.signal);
        if ([301, 302, 303, 307, 308].includes(reply.status)) {
          if (redirects === 3 || !reply.headers.location) throw new Error("重定向超过 3 次或缺少目标地址。");
          url = validateWindowUrl(new URL(reply.headers.location, url).href);
          continue;
        }
        if (reply.status < 200 || reply.status >= 300) throw new Error(`网页返回 HTTP ${reply.status}。`);
        if (reply.body.length > MAX_BYTES) throw new Error("网页超过 1 MB 上限。");
        if (reply.headers["content-encoding"] && reply.headers["content-encoding"] !== "identity") throw new Error("网页使用不支持的压缩编码。");
        const contentType = reply.headers["content-type"] ?? "";
        if (!/^text\/(html|plain)(?:;|$)/i.test(contentType)) throw new Error("只支持 HTML 或纯文本网页。");
        const raw = reply.body.toString("utf8");
        const text = contentType.toLowerCase().startsWith("text/html") ? extractArticleText(raw, MAX_BYTES) : raw.trim();
        if (!text) throw new Error("网页没有可读取的正文；需要登录或动态加载的页面请手动核对。");
        const marker = field.trim();
        const index = marker ? text.indexOf(marker) : 0;
        const excerpt = text.slice(Math.max(0, index - 160), Math.max(0, index - 160) + 600);
        return { status: "success", url: url.href, checkedAt, hash: createHash("sha256").update(text).digest("hex"), excerpt, value: marker ? `${index < 0 ? "未找到" : "找到"}原文标记：${marker}` : "已读取正文；哈希仅表示文本变化" };
      }
      throw new Error("检查未完成。");
    };
    return await Promise.race([operation(), timeout]);
  } catch (error) {
    return { status: "failed", url: input, checkedAt, error: error instanceof Error ? error.message : "网页检查未完成。" };
  } finally { if (timer) clearTimeout(timer); }
}


