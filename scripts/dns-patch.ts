import dns from "node:dns";

/**
 * 这台电脑的路由器有时解析不了 supabase.co（见项目记忆）：先用 8.8.8.8 查，查不到再走系统的。
 * 只给本机跑的脚本用（填表助手、大搜），网页那边不引。
 */

export function patchDns(): void {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  const original = dns.lookup;
  const patched = ((host: string, options: unknown, callback?: unknown) => {
    const cb = (typeof options === "function" ? options : callback) as (err: Error | null, address?: unknown, family?: number) => void;
    const opts = (typeof options === "function" || options === undefined ? {} : options) as { all?: boolean; family?: number };
    if (opts.family === 6) return (original as (...a: unknown[]) => void)(host, options, callback);
    dns.resolve4(host, (err, addresses) => {
      if (err || !addresses?.length) return (original as (...a: unknown[]) => void)(host, options, callback);
      if (opts.all) cb(null, addresses.map((address) => ({ address, family: 4 })));
      else cb(null, addresses[0], 4);
    });
  }) as typeof dns.lookup;
  dns.lookup = patched;
}

