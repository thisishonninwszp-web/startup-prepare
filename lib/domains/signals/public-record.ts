import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { displayQuestion } from "./practice-shared";

/**
 * 公开对账页：/record/<口令>，不用登录。只放周刊上公开押过的判断（标签「周刊」）和结果，别的一概不放。
 * 口令是随机的，关掉就删掉那一行，旧链接立刻失效。
 */

const MISSING_MIGRATION = "迁移 072 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/072_signal_public_records.sql。";

/** 现在的口令（没开为 null）；表还没建返回 "missing-schema"。 */
export async function getPublicToken(userId: string): Promise<string | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("signal_public_records").select("token").eq("user_id", userId).maybeSingle();
  if (error) {
    if (/signal_public_records/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data?.token as string | undefined) ?? null;
}

/** 打开公开对账页（已经开着就沿用原来的口令）。 */
export async function enablePublicRecord(userId: string): Promise<string> {
  const existing = await getPublicToken(userId);
  if (existing === "missing-schema") throw new Error(MISSING_MIGRATION);
  if (existing) return existing;
  const token = randomBytes(12).toString("base64url");
  const { error } = await supabaseAdmin.from("signal_public_records").insert({ user_id: userId, token });
  if (error) throw new Error(error.message);
  return token;
}

/** 关掉：删掉口令，旧链接立刻失效（以后再开是新链接）。 */
export async function disablePublicRecord(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("signal_public_records").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export type PublicBet = {
  question: string;
  judgment: string;
  made_on: string;
  due_on: string;
  outcome: "pending" | "hit" | "miss";
  /** 自动对账时写的那句（带出处）；他自己对账写的备注不公开。 */
  autoNote: string | null;
};

/** 口令对得上就返回公开的那几条，对不上返回 null。 */
export async function loadPublicRecord(token: string): Promise<PublicBet[] | null> {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const { data: owner, error } = await supabaseAdmin.from("signal_public_records").select("user_id").eq("token", token).maybeSingle();
  if (error || !owner) return null;
  const { data, error: betsError } = await supabaseAdmin
    .from("signal_judgments")
    .select("question, judgment, created_at, predictions!inner(due_at, outcome, note)")
    .eq("user_id", owner.user_id as string)
    .contains("tags", ["周刊"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (betsError) return null;
  return (data ?? []).map((r) => {
    const p = (Array.isArray(r.predictions) ? r.predictions[0] : r.predictions) as { due_at: string; outcome: PublicBet["outcome"]; note: string | null };
    return {
      question: displayQuestion(r.question as string).replace(/^周刊上公开押的：/, ""),
      judgment: r.judgment as string,
      made_on: (r.created_at as string).slice(0, 10),
      due_on: p.due_at.slice(0, 10),
      outcome: p.outcome,
      autoNote: p.note?.startsWith("自动对账：") ? p.note : null,
    };
  });
}
