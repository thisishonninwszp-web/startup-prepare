import { supabaseAdmin } from "@/lib/supabase";
import { tokyoToday } from "./brief";
import { listAllSignups, loadFakeDoorStats } from "./fake-door";
import { listGapBoard } from "./gaps";
import { gapIdeaTitle, transferKey, type GapSide } from "./gaps-shared";
import { getIssue } from "./issue";
import { listJudgments } from "./practice";
import { dueJudgments } from "./practice-shared";
import { loadGapVoices } from "./voices";
import { listOpenGapsForAct } from "@/lib/domains/ideas/info-gaps";
import type { ActGap, ActSignup, ActState } from "./act-shared";

export * from "./act-shared";

/**
 * 本周行动的状态：差距清单每条走到哪一格（听过原话、假门、留邮箱、联系过、变成想法、记过验证），
 * 还没联系的登记、到期没对账的判断、这周的周刊。全是现成的表，只读不写、不调 AI。
 * 哪张表还没建（迁移没跑），那一格就当没有。
 */
export async function loadActState(userId: string): Promise<ActState> {
  const today = tokyoToday();
  const [board, voices, doors, signups, ideas, judgments, issue, infoGaps] = await Promise.all([
    listGapBoard(userId, today),
    loadGapVoices(userId),
    loadFakeDoorStats(userId),
    listAllSignups(userId).catch(() => []),
    supabaseAdmin.from("ideas").select("id, title").eq("user_id", userId).neq("status", "归档"),
    listJudgments(userId).catch(() => []),
    getIssue(userId).catch(() => null),
    listOpenGapsForAct(userId).catch(() => []),
  ]);
  if (ideas.error) throw new Error(ideas.error.message);

  // 想法记过几次验证（真实接触）
  const ideaRows = (ideas.data ?? []) as { id: string; title: string | null }[];
  const validationCount = new Map<string, number>();
  if (ideaRows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("validations")
      .select("idea_id")
      .in(
        "idea_id",
        ideaRows.map((i) => i.id)
      );
    if (error) throw new Error(error.message);
    for (const v of data ?? []) validationCount.set(v.idea_id as string, (validationCount.get(v.idea_id as string) ?? 0) + 1);
  }
  const ideaByTitle = new Map(ideaRows.filter((i) => i.title).map((i) => [i.title as string, i.id]));

  // 每页联系过几个
  const contactedByDoor = new Map<string, number>();
  for (const s of signups) {
    if (s.contacted_at && s.door.kind === "gap" && s.door.side && s.door.signal_id) {
      const key = transferKey(s.door.side, s.door.signal_id);
      contactedByDoor.set(key, (contactedByDoor.get(key) ?? 0) + 1);
    }
  }

  const gaps: ActGap[] = (["japan", "us", "china"] as GapSide[]).flatMap((side) =>
    board.sides[side].open.map((g) => {
      const key = transferKey(side, g.signal_id);
      const v = voices.get(key);
      const d = doors.get(key);
      const ideaId = ideaByTitle.get(gapIdeaTitle(g.headline, side));
      return {
        side,
        signal_id: g.signal_id,
        headline: g.headline,
        quotes: v ? v.quotes.length : null,
        door: d
          ? { open: d.open, views: d.views, signups: d.signups, contacted: contactedByDoor.get(key) ?? 0, created_at: d.created_at, title: d.title }
          : null,
        idea: ideaId ? { id: ideaId, validations: validationCount.get(ideaId) ?? 0 } : null,
      };
    })
  );

  const uncontacted: ActSignup[] = signups
    .filter((s) => !s.contacted_at)
    .map((s) => ({
      id: s.id,
      email: s.email,
      created_at: s.created_at,
      doorTitle: s.door.title,
      doorHref:
        s.door.kind === "gap" && s.door.side && s.door.signal_id
          ? `/signals/gaps/door?side=${s.door.side}&signal=${s.door.signal_id}`
          : `/signals/issue/door?lang=${s.door.lang}`,
    }));

  return {
    today,
    gaps,
    uncontacted,
    dueJudgments: dueJudgments(judgments).length,
    issue: !issue || issue === "missing-schema" ? "none" : issue.published.length > 0 ? "published" : "draft",
    infoGaps,
  };
}
