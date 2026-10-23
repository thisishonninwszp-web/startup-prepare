import { meanBrier, SCORE_MIN } from "./calibration-shared";

/**
 * 一起练（迁移 098）—— 不碰数据库的部分：几个人在同一批题上谁更准。
 * 只用于对世界事件的预测（原则 1 例外四）；两边都打开「公开我的分数」才算进来。
 */

export type Answered = { user: string; question: string; p: number; y: boolean };

export type PersonScore = { user: string; n: number; brier: number | null };

/** 每个人的平均分（满 10 道才给分）。 */
export function scoresByUser(rows: Answered[], users: string[]): PersonScore[] {
  return users.map((user) => {
    const mine = rows.filter((r) => r.user === user);
    return { user, n: mine.length, brier: mine.length >= SCORE_MIN ? meanBrier(mine.map((r) => ({ p: r.p, y: r.y }))) : null };
  });
}

export type HeadToHead = { other: string; n: number; meCloser: number; otherCloser: number; tie: number };

/** 我和另一个人都答过的题里，谁离结果更近（只数次数）。 */
export function headToHead(rows: Answered[], me: string, other: string): HeadToHead {
  const mine = new Map(rows.filter((r) => r.user === me).map((r) => [r.question, r]));
  let n = 0;
  let meCloser = 0;
  let otherCloser = 0;
  let tie = 0;
  for (const r of rows.filter((x) => x.user === other)) {
    const m = mine.get(r.question);
    if (!m) continue;
    n += 1;
    const y = r.y ? 1 : 0;
    const a = Math.abs(m.p - y);
    const b = Math.abs(r.p - y);
    if (Math.abs(a - b) < 1e-9) tie += 1;
    else if (a < b) meCloser += 1;
    else otherCloser += 1;
  }
  return { other, n, meCloser, otherCloser, tie };
}

/** 页面上显示的名字：邮箱 @ 前面那段。 */
export function displayName(email: string | null | undefined): string {
  return (email ?? "").split("@")[0] || "（没有名字）";
}
