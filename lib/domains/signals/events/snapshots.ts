import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { validateSourceUrl, validateText, validateUuid, type CaptureScope } from "./domain";

type SourceRow = { id: string; title: string | null; source: string; url: string | null; published_at: string | null; fetched_at: string | null; raw_text: string; excerpt: string | null };
export type SnapshotPayload = { signal_id: string; title: string; source_name: string; source_url: string | null; published_at: string | null; source_fetched_at: string | null; capture_scope: CaptureScope; captured_text: string; payload_hash: string };
export function snapshotHash(value: Omit<SnapshotPayload, "payload_hash">): string {
  return createHash("sha256").update(JSON.stringify([value.title, value.source_name, value.source_url, value.published_at, value.source_fetched_at, value.capture_scope, value.captured_text])).digest("hex");
}
export function prepareSnapshot(source: SourceRow): SnapshotPayload {
  const text = source.excerpt?.trim() || source.raw_text.trim();
  const payload = {
    signal_id: source.id, title: validateText(source.title ?? "无标题", 1000, true), source_name: validateText(source.source, 200, true),
    source_url: validateSourceUrl(source.url), published_at: source.published_at, source_fetched_at: source.fetched_at,
    capture_scope: (source.excerpt?.trim() ? "excerpt" : "summary") as CaptureScope, captured_text: validateText(text, 100_000, true),
  };
  for (const time of [payload.published_at, payload.source_fetched_at]) if (time && !Number.isFinite(Date.parse(time))) throw new Error("来源时间无效");
  return { ...payload, payload_hash: snapshotHash(payload) };
}
export async function captureSnapshot(viewerId: string, signalId: string): Promise<{ id: string; captured_text: string }> {
  validateUuid(viewerId); validateUuid(signalId);
  const source = await supabaseAdmin.from("external_signals").select("id,title,source,url,published_at,fetched_at,raw_text,excerpt").eq("id", signalId).maybeSingle();
  if (source.error) throw new Error(source.error.message);
  if (!source.data) throw new Error("原始消息不存在");
  const payload = prepareSnapshot(source.data as SourceRow);
  const existing = await supabaseAdmin.from("signal_source_snapshots").select("id,captured_text").eq("user_id", viewerId).eq("signal_id", signalId).eq("payload_hash", payload.payload_hash).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as { id: string; captured_text: string };
  const inserted = await supabaseAdmin.from("signal_source_snapshots").insert({ ...payload, user_id: viewerId }).select("id,captured_text").single();
  if (!inserted.error && inserted.data) return inserted.data as { id: string; captured_text: string };
  if (inserted.error?.code !== "23505") throw new Error(inserted.error?.message ?? "保存来源失败");
  const raced = await supabaseAdmin.from("signal_source_snapshots").select("id,captured_text").eq("user_id", viewerId).eq("signal_id", signalId).eq("payload_hash", payload.payload_hash).single();
  if (raced.error || !raced.data) throw new Error(raced.error?.message ?? "保存来源失败");
  return raced.data as { id: string; captured_text: string };
}
