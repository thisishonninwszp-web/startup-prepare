"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  addGapEvidence,
  generateIdeaGaps,
  saveFounderFacts,
  setGapStatus,
  type GapStatus,
  type IdeaFit,
  type InfoGap,
} from "@/lib/domains/ideas/info-gaps";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAsks } from "@/lib/domains/signals/asks";
import type { AsksResult } from "@/lib/domains/signals/asks-shared";
import { ANY_AREA, isGrantArea, searchGrants, type Grant } from "@/lib/domains/ideas/grants";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 数一数有多少人在问：知恵袋、联想加假名、国会、YouTube，给了英文说法再加 Reddit（二三十秒，不存，想留下就自己补一条）。 */
export async function countAsksAction(phrase: string, en = ""): Promise<{ ok: true; result: AsksResult } | { ok: false; message: string }> {
  try {
    await requireUserId();
    const p = phrase.replace(/[\s　]+/g, " ").trim().slice(0, 60);
    if (!p) return { ok: false, message: "先写一句普通人会搜的话" };
    const e = en.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
    return { ok: true, result: await fetchAsks(p, new Date(), /^[a-z][a-z' -]*$/.test(e) ? e : "") };
  } catch (error) {
    return { ok: false, message: message(error, "这次没数成") };
  }
}

/** 现在还在招募的补助金（jGrants，不存）。 */
export async function searchGrantsAction(keyword: string, area: string): Promise<{ ok: true; grants: Grant[] } | { ok: false; message: string }> {
  try {
    await requireUserId();
    const k = keyword.replace(/[\s　]+/g, " ").trim().slice(0, 30);
    if (k.length < 2) return { ok: false, message: "关键词至少写两个字" };
    const grants = await searchGrants(k, isGrantArea(area) ? area : ANY_AREA);
    if (grants === null) return { ok: false, message: "jGrants 这次没连上，过一会儿再查" };
    return { ok: true, grants };
  } catch (error) {
    return { ok: false, message: message(error, "这次没查成") };
  }
}

/** 列（或重列）这个想法的信息缺口（二三十秒）。 */
export async function generateIdeaGapsAction(ideaId: string): Promise<{ ok: true; gaps: InfoGap[]; fit: IdeaFit | null } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    const result = await generateIdeaGaps(userId, ideaId);
    revalidatePath(`/ideas/${ideaId}`);
    revalidatePath("/signals/act");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: message(error, "这次没列成") };
  }
}

export async function setGapStatusAction(gapId: string, status: GapStatus, note: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (!["open", "got", "none"].includes(status)) throw new Error("不认识这个状态");
    const userId = await requireUserId();
    await setGapStatus(userId, gapId, status, note);
    revalidatePath("/signals/act");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}

export async function saveFounderFactsAction(text: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    await saveFounderFacts(userId, String(text ?? ""));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没存上") };
  }
}

/**
 * 外部信号的一条补进某个想法的缺口：标题和链接按 id 从库里重新取，不信浏览器传来的。
 * 补进来的信息只追加，信息源体检按它数「进了决定几条」。
 */
export async function routeSignalToGapAction(signalId: string, gapId: string, note: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabaseAdmin.from("external_signals").select("id, title, url").eq("id", signalId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("找不到这一条了");
    await addGapEvidence(userId, gapId, {
      signal_id: data.id as string,
      title: (data.title as string | null) ?? "（没有标题）",
      url: (data.url as string | null) ?? null,
      note: note.trim().slice(0, 200) || undefined,
    });
    revalidatePath("/signals/sources");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没补进去") };
  }
}

/** 他自己记一条（不是从外部信号来的）：拿到了什么、在哪看到的。 */
export async function addOwnGapEvidenceAction(gapId: string, text: string, url: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const userId = await requireUserId();
    const title = text.trim().slice(0, 300);
    if (!title) throw new Error("写一句拿到了什么");
    const link = url.trim();
    if (link && !/^https?:\/\//i.test(link)) throw new Error("链接要以 http 开头");
    await addGapEvidence(userId, gapId, { title, url: link || null });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error, "没记上") };
  }
}
