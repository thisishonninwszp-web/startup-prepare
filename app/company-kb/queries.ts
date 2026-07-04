import { supabaseAdmin } from "@/lib/supabase";
import type { CompanyKbFact, CompanyKbNote } from "./types";

export async function listCompanyKbNotes(userId: string): Promise<CompanyKbNote[]> {
  const { data, error } = await supabaseAdmin
    .from("company_kb_notes")
    .select("id, title, content, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("列出公司知识库笔记失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []) as CompanyKbNote[];
}

export async function getCompanyKbNote(
  noteId: string,
  userId: string
): Promise<CompanyKbNote | null> {
  const { data, error } = await supabaseAdmin
    .from("company_kb_notes")
    .select("id, user_id, title, content, created_at, updated_at")
    .eq("id", noteId)
    .maybeSingle();
  if (error) {
    console.error("读取公司知识库笔记失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  if (!data || data.user_id !== userId) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    content: data.content as string,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

export async function listCompanyKbFacts(userId: string): Promise<CompanyKbFact[]> {
  const { data, error } = await supabaseAdmin
    .from("company_kb_facts")
    .select("id, fact, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("列出公司事实失败", error.message);
    throw new Error("读取数据失败，请重试");
  }
  return (data ?? []) as CompanyKbFact[];
}
