"use server";

import { actionSecret, verifyAction, type ActionPayload } from "@/lib/action-links";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { loadForecastBoard, MODE_LABELS, pct, setMyForecast } from "@/lib/domains/signals/forecast";
import { marksFor, setMark, type MarkKind } from "@/lib/domains/signals/memory";
import { rateRecall, recallReveal, type RecallReveal } from "@/lib/domains/signals/recall";
import type { RecallResult } from "@/lib/domains/signals/recall-shared";

/** 邮件里点一下就完成的那几件事：口令验过才做，做的是口令里那个人的事（不看浏览器登没登录）。 */

function payload(token: string, kind: ActionPayload["k"]): ActionPayload {
  const secret = actionSecret();
  const p = secret ? verifyAction(token, secret) : null;
  if (!p || p.k !== kind) throw new Error("链接过期了或者不对：回网站上做吧");
  return p;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 标新闻、给预测题点「行」或点一档。 */
export async function confirmTapAction(token: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const secret = actionSecret();
    const p = secret ? verifyAction(token, secret) : null;
    if (!p) throw new Error("链接过期了或者不对：回网站上做吧");
    if (p.k === "mark") {
      if (!["important", "mine", "doubt"].includes(p.v)) throw new Error("链接不对");
      // 已经写过「为什么在意」的不冲掉
      const existing = (await marksFor(p.u, [p.t])).get(p.t);
      await setMark(p.u, p.t, p.v as MarkKind, existing?.note ?? "");
      return { ok: true, message: "标上了。以后会在「你在跟的事」里接上它的后续，过一周还会问你一次还记不记得。" };
    }
    if (p.k === "forecast") {
      const r = await setMyForecast(p.u, p.t, p.v === "agree" ? "agree" : Number(p.v), tokyoToday());
      const board = await loadForecastBoard(p.u);
      const of = (s: string) => (board === "missing-schema" ? undefined : board.forecasts.find((f) => f.question_id === p.t && f.source === s));
      const ai = of("ai");
      const market = of("market");
      const base = of("base");
      return {
        ok: true,
        // AI 那个数写原始的和校准后的，免得「你 49%（同意 AI）· AI 60%」看着对不上
        message: [
          `记上了：你 ${pct(r.probability)}（${MODE_LABELS[r.mode]}）`,
          ai ? `AI ${pct(ai.probability)}${r.mode === "agree" && Math.abs(ai.probability - r.probability) >= 0.005 ? `（按回测校准是 ${pct(r.probability)}）` : ""}` : "AI 还没判断", market ? `市场 ${pct(market.probability)}` : null, base ? `统计基准 ${pct(base.probability)}` : null]
          .filter(Boolean)
          .join(" · "),
      };
    }
    throw new Error("链接不对");
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}

/** 回想：他想过以后看答案。 */
export async function revealByTokenAction(token: string): Promise<{ ok: true; reveal: RecallReveal } | { ok: false; message: string }> {
  try {
    const p = payload(token, "recall");
    return { ok: true, reveal: await recallReveal(p.u, p.t) };
  } catch (error) {
    return { ok: false, message: message(error, "没取到") };
  }
}

/** 回想：记得 / 模糊 / 忘了。 */
export async function rateByTokenAction(token: string, result: RecallResult): Promise<{ ok: true; next: string } | { ok: false; message: string }> {
  try {
    const p = payload(token, "recall");
    return { ok: true, next: await rateRecall(p.u, p.t, result, tokyoToday()) };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}
