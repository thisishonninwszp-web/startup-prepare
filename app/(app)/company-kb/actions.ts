"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

// ── 笔记 ──────────────────────────────────────────────────────────────────────

export async function createCompanyKbNote(
  title: string,
  content: string
): Promise<{ id: string }> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("标题不能为空");
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("company_kb_notes")
    .insert({ user_id: userId, title: cleanTitle, content: content.trim() })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/company-kb");
  return data;
}

export async function updateCompanyKbNote(
  noteId: string,
  title: string,
  content: string
): Promise<void> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("标题不能为空");
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("company_kb_notes")
    .update({
      title: cleanTitle,
      content: content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/company-kb");
  revalidatePath(`/company-kb/${noteId}`);
}

export async function deleteCompanyKbNote(noteId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("company_kb_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/company-kb");
}

// ── 公司事实 ──────────────────────────────────────────────────────────────────

export async function addCompanyKbFact(fact: string): Promise<{ id: string }> {
  const cleanFact = fact.trim();
  if (!cleanFact) throw new Error("内容不能为空");
  if (cleanFact.length > 1000) throw new Error("不能超过 1000 字");
  const userId = await requireUserId();
  const { data, error } = await supabaseAdmin
    .from("company_kb_facts")
    .insert({ user_id: userId, fact: cleanFact })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/company-kb");
  return data;
}

export async function archiveCompanyKbFact(factId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabaseAdmin
    .from("company_kb_facts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", factId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/company-kb");
}
