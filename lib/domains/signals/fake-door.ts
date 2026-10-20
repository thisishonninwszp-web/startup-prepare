import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { EXTERNAL_TAG } from "@/app/(app)/ideas/types";
import { draftFakeDoor, draftIssueDoor } from "@/lib/ai";
import { findJapanGap } from "./gaps";
import { gapPlaces, transferKey, type GapSide } from "./gaps-shared";
import { loadGapVoices } from "./voices";
import { listIssues } from "./issue";
import {
  DOOR_NOTE_MAX,
  doorLang,
  maskEmail,
  validDoorContent,
  validEmail,
  type DoorLang,
  type DoorTarget,
  type FakeDoorContent,
  type FakeDoorDraft,
  type FakeDoorStats,
} from "./fake-door-shared";

export * from "./fake-door-shared";

/**
 * 假门测试：差距清单里的一条（或者周刊本身的付费版），做一页"准备中"（/soon/<随机口令>，不用登录），写明预计价格，
 * 陌生人可以留邮箱"做出来了告诉我"。只数看了几次、留了几个邮箱。
 * 留下的邮箱只有他自己看得到；同时记一条带「假门登记」标签的观察（不含完整邮箱），进捕捉链条。
 */

const MISSING_MIGRATION = "迁移 076 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/076_signal_fake_doors.sql。";
const MISSING_077 = "迁移 077 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/077_signal_fake_door_issue.sql。";

/** 一页一小时最多收几个登记（防有人刷）。 */
const SIGNUPS_PER_HOUR = 30;

export type FakeDoor = {
  id: string;
  /** 周刊那种（kind=issue）没有。 */
  signal_id: string | null;
  side: GapSide | null;
  token: string;
  lang: DoorLang;
  content: FakeDoorContent;
  views: number;
  open: boolean;
  created_at: string;
};

/** contacted_at：他联系过这个人的时候（迁移 087 之前一律是 null）。 */
export type DoorSignup = { id: string; email: string; note: string | null; created_at: string; contacted_at: string | null };

const DOOR_COLUMNS = "id, signal_id, side, token, lang, content, views, open, created_at";

function missing(error: { message: string }): boolean {
  return /signal_fake_door/.test(error.message);
}

/** 077 之前没有 kind 这一列（周刊那种还开不了）。 */
function missingKind(error: { message: string }): boolean {
  return /\bkind\b/.test(error.message);
}

/** 这一页（没做过为 null）；表还没建返回 "missing-schema"，周刊那种在迁移 077 之前返回 "missing-077"。 */
export async function getFakeDoor(userId: string, target: DoorTarget): Promise<FakeDoor | null | "missing-schema" | "missing-077"> {
  const base = supabaseAdmin.from("signal_fake_doors").select(DOOR_COLUMNS).eq("user_id", userId);
  const query =
    target.kind === "gap" ? base.eq("signal_id", target.signalId).eq("side", target.side) : base.eq("kind", "issue").eq("lang", target.lang);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (target.kind === "issue" && missingKind(error)) return "missing-077";
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data as FakeDoor | null) ?? null;
}

/** 差距清单上每条要显示的：看了几次、留了几个邮箱、开着没有（键见 transferKey）。表还没建时返回空。 */
export async function loadFakeDoorStats(userId: string): Promise<Map<string, FakeDoorStats>> {
  const { data, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .select("id, signal_id, side, views, open, created_at, content, signal_fake_door_signups(count)")
    .eq("user_id", userId)
    .not("signal_id", "is", null);
  if (error) {
    if (missing(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map(
    (data ?? []).map((r) => {
      const counted = r.signal_fake_door_signups as unknown as { count: number }[] | null;
      return [
        transferKey(r.side as GapSide, r.signal_id as string),
        {
          id: r.id as string,
          views: r.views as number,
          signups: counted?.[0]?.count ?? 0,
          open: r.open as boolean,
          created_at: r.created_at as string,
          title: (r.content as FakeDoorContent).title,
        },
      ];
    })
  );
}

/** 开着的日文假门（周刊 note 版文末要放链接）：键见 transferKey。表还没建时返回空。 */
export async function loadOpenDoorLinks(userId: string): Promise<Record<string, { token: string; title: string }>> {
  const { data, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .select("signal_id, side, token, content")
    .eq("user_id", userId)
    .eq("open", true)
    .eq("lang", "ja")
    .not("signal_id", "is", null);
  if (error) {
    if (missing(error)) return {};
    throw new Error(error.message);
  }
  return Object.fromEntries(
    (data ?? []).map((r) => [
      transferKey(r.side as GapSide, r.signal_id as string),
      { token: r.token as string, title: (r.content as FakeDoorContent).title },
    ])
  );
}

export type IssueDoorSummary = { token: string; title: string; open: boolean; views: number; signups: number };

/** 周刊付费版的两页（中文、日文，做过的才有）。表没建、077 没跑都返回空。 */
export async function loadIssueDoors(userId: string): Promise<Partial<Record<DoorLang, IssueDoorSummary>>> {
  const { data, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .select("lang, token, content, views, open, signal_fake_door_signups(count)")
    .eq("user_id", userId)
    .eq("kind", "issue");
  if (error) {
    if (missing(error) || missingKind(error)) return {};
    throw new Error(error.message);
  }
  return Object.fromEntries(
    (data ?? []).map((r) => {
      const counted = r.signal_fake_door_signups as unknown as { count: number }[] | null;
      return [
        r.lang as DoorLang,
        {
          token: r.token as string,
          title: (r.content as FakeDoorContent).title,
          open: r.open as boolean,
          views: r.views as number,
          signups: counted?.[0]?.count ?? 0,
        },
      ];
    })
  );
}

/**
 * AI 起草那一页的文字（价格、运营者他自己填）。
 * 差距的那种：查过"这边有人在头疼吗"的，把那件麻烦一起给它。周刊的那种：给它最近几期写过的几条当例子。
 */
export async function draftFakeDoorContent(userId: string, target: DoorTarget): Promise<FakeDoorDraft> {
  if (target.kind === "issue") {
    const issues = await listIssues(userId);
    const recent = issues.flatMap((i) => i.content.picks.map((p) => p.headline)).slice(0, 6);
    return draftIssueDoor({ lang: target.lang, recent });
  }
  const { signalId, side } = target;
  const gap = await findJapanGap(userId, signalId, side);
  if (!gap) throw new Error("清单里找不到这一条了");
  const { there, here } = gapPlaces(side);
  const voices = (await loadGapVoices(userId)).get(transferKey(side, signalId));
  return draftFakeDoor({
    lang: doorLang(side),
    headline: gap.headline,
    background: gap.background,
    hereNow: gap.japan,
    there,
    here,
    pain: voices && voices.quotes.length > 0 ? voices.pain : null,
  });
}

/** 发布（第一次生成口令）或改文字。内容按 validDoorContent 查。 */
export async function saveFakeDoor(userId: string, target: DoorTarget, raw: unknown): Promise<FakeDoor> {
  const content = validDoorContent(raw);
  if (typeof content === "string") throw new Error(content);
  const existing = await getFakeDoor(userId, target);
  if (existing === "missing-schema") throw new Error(MISSING_MIGRATION);
  if (existing === "missing-077") throw new Error(MISSING_077);
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("signal_fake_doors")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select(DOOR_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as FakeDoor;
  }
  const token = randomBytes(12).toString("base64url");
  let row: Record<string, unknown>;
  if (target.kind === "gap") {
    if (!(await findJapanGap(userId, target.signalId, target.side))) throw new Error("清单里找不到这一条了");
    // 不写 kind（默认 gap）：077 没跑也能用
    row = { user_id: userId, signal_id: target.signalId, side: target.side, token, lang: doorLang(target.side), content };
  } else {
    row = { user_id: userId, kind: "issue", token, lang: target.lang, content };
  }
  const { data, error } = await supabaseAdmin.from("signal_fake_doors").insert(row).select(DOOR_COLUMNS).single();
  if (error) {
    if (missingKind(error)) throw new Error(MISSING_077);
    throw new Error(error.message);
  }
  return data as FakeDoor;
}

/** 关掉（页面只说募集结束、不再收邮箱）或重新打开。 */
export async function setFakeDoorOpen(userId: string, doorId: string, open: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_fake_doors")
    .update({ open, updated_at: new Date().toISOString() })
    .eq("id", doorId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** 留下的邮箱（只有他自己看得到），新的在前。 */
export async function listDoorSignups(userId: string, doorId: string): Promise<DoorSignup[]> {
  // 087 没跑就不带 contacted_at 再查一次（一律当没联系过）
  for (const columns of ["id, email, note, created_at, contacted_at", "id, email, note, created_at"]) {
    const { data, error } = await supabaseAdmin
      .from("signal_fake_door_signups")
      .select(columns)
      .eq("user_id", userId)
      .eq("door_id", doorId)
      .order("created_at", { ascending: false });
    if (!error) return ((data ?? []) as unknown as DoorSignup[]).map((r) => ({ ...r, contacted_at: r.contacted_at ?? null }));
    if (!/contacted_at/.test(error.message)) throw new Error(error.message);
  }
  return [];
}

/** 记下联系过这个人（或者取消这个记号）。 */
export async function setSignupContacted(userId: string, signupId: string, contacted: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .update({ contacted_at: contacted ? new Date().toISOString() : null })
    .eq("id", signupId)
    .eq("user_id", userId);
  if (error) {
    if (/contacted_at/.test(error.message)) {
      throw new Error("迁移 087 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/087_signal_door_contacted.sql。");
    }
    throw new Error(error.message);
  }
}

/** 本周行动要用的：所有登记（哪一页、联系过没有）。087 没跑就一律当没联系过。表没建返回空。 */
export async function listAllSignups(userId: string): Promise<
  { id: string; email: string; created_at: string; contacted_at: string | null; door: { kind: "gap" | "issue"; signal_id: string | null; side: GapSide | null; lang: DoorLang; title: string } }[]
> {
  const doorCols = "signal_fake_doors!inner(signal_id, side, lang, content)";
  for (const [columns, withKind] of [
    [`id, email, created_at, contacted_at, signal_fake_doors!inner(kind, signal_id, side, lang, content)`, true],
    [`id, email, created_at, contacted_at, ${doorCols}`, false],
    [`id, email, created_at, ${doorCols}`, false],
  ] as const) {
    const { data, error } = await supabaseAdmin.from("signal_fake_door_signups").select(columns).eq("user_id", userId).order("created_at");
    if (error) {
      if (missing(error) && !/contacted_at|kind/.test(error.message)) return [];
      if (/contacted_at|kind/.test(error.message)) continue;
      throw new Error(error.message);
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const d = (Array.isArray(r.signal_fake_doors) ? r.signal_fake_doors[0] : r.signal_fake_doors) as Record<string, unknown>;
      return {
        id: r.id as string,
        email: r.email as string,
        created_at: r.created_at as string,
        contacted_at: (r.contacted_at as string | null | undefined) ?? null,
        door: {
          kind: withKind ? (d.kind as "gap" | "issue") : d.signal_id ? "gap" : "issue",
          signal_id: (d.signal_id as string | null) ?? null,
          side: (d.side as GapSide | null) ?? null,
          lang: d.lang as DoorLang,
          title: (d.content as FakeDoorContent).title,
        },
      };
    });
  }
  return [];
}

/** 删掉一个登记（连同那条观察）。他自己删、或者登记的人自己取消，都走这里。 */
async function removeSignup(row: { id: string; user_id: string; observation_id: string | null }): Promise<void> {
  if (row.observation_id) {
    const { error } = await supabaseAdmin.from("observations").delete().eq("id", row.observation_id).eq("user_id", row.user_id);
    // 观察已经被别的东西引用（追问、想法）删不掉时，至少把他写的那句和打了码的邮箱抹掉
    if (error) {
      await supabaseAdmin
        .from("observations")
        .update({ raw_text: "假门登记（登记的人已经取消，内容已删除）" })
        .eq("id", row.observation_id)
        .eq("user_id", row.user_id);
    }
  }
  const { error } = await supabaseAdmin.from("signal_fake_door_signups").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
}

export async function deleteDoorSignup(userId: string, signupId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .select("id, user_id, observation_id")
    .eq("id", signupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  await removeSignup(data as { id: string; user_id: string; observation_id: string | null });
}

// ── 公开页（不用登录，按口令认） ───────────────────────────────────────────

const TOKEN_RE = /^[\w-]{10,40}$/;

export type PublicDoor = { lang: DoorLang; content: FakeDoorContent; open: boolean };

export async function loadPublicDoor(token: string): Promise<PublicDoor | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data, error } = await supabaseAdmin.from("signal_fake_doors").select("lang, content, open").eq("token", token).maybeSingle();
  if (error || !data) return null;
  return data as PublicDoor;
}

/** 看了一次（页面上的脚本报的；关掉的不数）。 */
export async function recordDoorView(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) return;
  const { error } = await supabaseAdmin.rpc("signal_fake_door_view", { p_token: token });
  if (error) console.error("door view failed", error.message);
}

export type SignupResult = { ok: true; cancelToken: string } | { ok: false; reason: "invalid" | "duplicate" | "busy" | "closed" | "failed" };

/**
 * 陌生人留邮箱。trap 是藏起来的那一格，有内容就是机器人：装作成功，什么都不存。
 * 同一页同一个邮箱只收一次；一小时超过 SIGNUPS_PER_HOUR 个就先不收。
 */
export async function signupToDoor(token: string, rawEmail: string, rawNote: string, trap: string): Promise<SignupResult> {
  if (trap.trim()) return { ok: true, cancelToken: randomBytes(12).toString("base64url") };
  const email = validEmail(rawEmail);
  if (!email) return { ok: false, reason: "invalid" };
  if (!TOKEN_RE.test(token)) return { ok: false, reason: "failed" };
  const { data: door, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .select("id, user_id, open, content")
    .eq("token", token)
    .maybeSingle();
  if (error || !door) return { ok: false, reason: "failed" };
  if (!door.open) return { ok: false, reason: "closed" };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .select("id", { count: "exact", head: true })
    .eq("door_id", door.id)
    .gte("created_at", since);
  if ((count ?? 0) >= SIGNUPS_PER_HOUR) return { ok: false, reason: "busy" };

  const note = rawNote.trim().slice(0, DOOR_NOTE_MAX) || null;
  const cancelToken = randomBytes(16).toString("base64url");
  const { data: signup, error: insertError } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .insert({ door_id: door.id, user_id: door.user_id, email, note, cancel_token: cancelToken })
    .select("id")
    .single();
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) return { ok: false, reason: "duplicate" };
    console.error("door signup failed", insertError.message);
    return { ok: false, reason: "failed" };
  }

  // 进捕捉链条（痛点雷达、周复盘看得到）：不放完整邮箱
  const content = door.content as FakeDoorContent;
  const { data: observation } = await supabaseAdmin
    .from("observations")
    .insert({
      user_id: door.user_id,
      raw_text: `假门登记：「${content.title}」（${content.price}）有人留了邮箱（${maskEmail(email)}）${note ? `，写了：「${note}」` : ""}`,
      tags: [EXTERNAL_TAG, "假门登记"],
    })
    .select("id")
    .single();
  if (observation) await supabaseAdmin.from("signal_fake_door_signups").update({ observation_id: observation.id }).eq("id", signup.id);
  return { ok: true, cancelToken };
}

/** 取消页要显示的：哪一页、什么语言。对不上返回 null。 */
export async function loadSignupForCancel(cancelToken: string): Promise<{ lang: DoorLang; title: string } | null> {
  if (!TOKEN_RE.test(cancelToken)) return null;
  const { data, error } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .select("signal_fake_doors!inner(lang, content)")
    .eq("cancel_token", cancelToken)
    .maybeSingle();
  if (error || !data) return null;
  const door = (Array.isArray(data.signal_fake_doors) ? data.signal_fake_doors[0] : data.signal_fake_doors) as {
    lang: DoorLang;
    content: FakeDoorContent;
  };
  return { lang: door.lang, title: door.content.title };
}

/** 登记的人自己取消：删掉邮箱和那条观察。 */
export async function cancelSignup(cancelToken: string): Promise<boolean> {
  if (!TOKEN_RE.test(cancelToken)) return false;
  const { data, error } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .select("id, user_id, observation_id")
    .eq("cancel_token", cancelToken)
    .maybeSingle();
  if (error || !data) return false;
  await removeSignup(data as { id: string; user_id: string; observation_id: string | null });
  return true;
}
