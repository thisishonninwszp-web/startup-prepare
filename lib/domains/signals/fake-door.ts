import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { EXTERNAL_TAG } from "@/app/(app)/ideas/types";
import { draftFakeDoor } from "@/lib/ai";
import { findJapanGap } from "./gaps";
import { gapPlaces, transferKey, type GapSide } from "./gaps-shared";
import { loadGapVoices } from "./voices";
import {
  DOOR_NOTE_MAX,
  doorLang,
  maskEmail,
  validDoorContent,
  validEmail,
  type DoorLang,
  type FakeDoorContent,
  type FakeDoorDraft,
  type FakeDoorStats,
} from "./fake-door-shared";

export * from "./fake-door-shared";

/**
 * 假门测试：差距清单里的一条，做一页"准备中的服务"（/soon/<随机口令>，不用登录），写明预计价格，
 * 陌生人可以留邮箱"做出来了告诉我"。只数看了几次、留了几个邮箱。
 * 留下的邮箱只有他自己看得到；同时记一条带「假门登记」标签的观察（不含完整邮箱），进捕捉链条。
 */

const MISSING_MIGRATION = "迁移 076 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/076_signal_fake_doors.sql。";

/** 一页一小时最多收几个登记（防有人刷）。 */
const SIGNUPS_PER_HOUR = 30;

export type FakeDoor = {
  id: string;
  signal_id: string;
  side: GapSide;
  token: string;
  lang: DoorLang;
  content: FakeDoorContent;
  views: number;
  open: boolean;
  created_at: string;
};

export type DoorSignup = { id: string; email: string; note: string | null; created_at: string };

const DOOR_COLUMNS = "id, signal_id, side, token, lang, content, views, open, created_at";

function missing(error: { message: string }): boolean {
  return /signal_fake_door/.test(error.message);
}

/** 这一条的假门（没做过为 null）；表还没建返回 "missing-schema"。 */
export async function getFakeDoor(userId: string, signalId: string, side: GapSide): Promise<FakeDoor | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .select(DOOR_COLUMNS)
    .eq("user_id", userId)
    .eq("signal_id", signalId)
    .eq("side", side)
    .maybeSingle();
  if (error) {
    if (missing(error)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data as FakeDoor | null) ?? null;
}

/** 差距清单上每条要显示的：看了几次、留了几个邮箱、开着没有（键见 transferKey）。表还没建时返回空。 */
export async function loadFakeDoorStats(userId: string): Promise<Map<string, FakeDoorStats>> {
  const { data, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .select("id, signal_id, side, views, open, signal_fake_door_signups(count)")
    .eq("user_id", userId);
  if (error) {
    if (missing(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map(
    (data ?? []).map((r) => {
      const counted = r.signal_fake_door_signups as unknown as { count: number }[] | null;
      return [
        transferKey(r.side as GapSide, r.signal_id as string),
        { id: r.id as string, views: r.views as number, signups: counted?.[0]?.count ?? 0, open: r.open as boolean },
      ];
    })
  );
}

/** AI 起草那一页的文字（价格、运营者他自己填）。查过"这边有人在头疼吗"的，把那件麻烦一起给它。 */
export async function draftFakeDoorContent(userId: string, signalId: string, side: GapSide): Promise<FakeDoorDraft> {
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
export async function saveFakeDoor(userId: string, signalId: string, side: GapSide, raw: unknown): Promise<FakeDoor> {
  const content = validDoorContent(raw);
  if (typeof content === "string") throw new Error(content);
  const existing = await getFakeDoor(userId, signalId, side);
  if (existing === "missing-schema") throw new Error(MISSING_MIGRATION);
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
  if (!(await findJapanGap(userId, signalId, side))) throw new Error("清单里找不到这一条了");
  const { data, error } = await supabaseAdmin
    .from("signal_fake_doors")
    .insert({ user_id: userId, signal_id: signalId, side, token: randomBytes(12).toString("base64url"), lang: doorLang(side), content })
    .select(DOOR_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
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
  const { data, error } = await supabaseAdmin
    .from("signal_fake_door_signups")
    .select("id, email, note, created_at")
    .eq("user_id", userId)
    .eq("door_id", doorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DoorSignup[];
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
