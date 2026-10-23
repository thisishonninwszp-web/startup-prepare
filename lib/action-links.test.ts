import { describe, expect, it } from "vitest";
import { actionSecret, LIST_TTL_DAYS, signAction, verifyAction } from "./action-links";

describe("邮件里点一下就完成的链接", () => {
  const p = { u: "user-1", k: "forecast" as const, t: "q-1", v: "0.7" };
  it("签了能验，改了任何一处都不认", () => {
    const token = signAction(p, "secret", 0);
    expect(verifyAction(token, "secret", 0)).toMatchObject(p);
    expect(verifyAction(token, "other", 0)).toBeNull();
    const [body, sig] = token.split(".");
    const tampered = Buffer.from(JSON.stringify({ ...p, v: "0.95", e: 9e9 })).toString("base64url");
    expect(verifyAction(`${tampered}.${sig}`, "secret", 0)).toBeNull();
    expect(verifyAction(`${body}.`, "secret", 0)).toBeNull();
  });
  it("七天后过期", () => {
    const token = signAction(p, "secret", 0);
    expect(verifyAction(token, "secret", 6 * 86_400_000)).not.toBeNull();
    expect(verifyAction(token, "secret", 8 * 86_400_000)).toBeNull();
  });
  it("清单的口令：认得出来，过期就不认", () => {
    const now = Date.parse("2026-10-24T00:00:00Z");
    const token = signAction({ u: "user-1", k: "list", t: "2026-10-24", v: "" }, "secret", now, LIST_TTL_DAYS);
    expect(verifyAction(token, "secret", now)?.k).toBe("list");
    expect(verifyAction(token, "secret", now + (LIST_TTL_DAYS + 1) * 86_400_000)).toBeNull();
  });
  it("密钥：先用 ACTION_SECRET，没配用 CRON_SECRET", () => {
    expect(actionSecret({ CRON_SECRET: "c" })).toBe("c");
    expect(actionSecret({ ACTION_SECRET: "a", CRON_SECRET: "c" })).toBe("a");
    expect(actionSecret({})).toBeNull();
  });
});
