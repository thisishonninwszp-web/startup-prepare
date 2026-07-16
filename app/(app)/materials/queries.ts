import { supabaseAdmin } from "@/lib/supabase";
import {
  parseMaterialDraft,
  parseMaterialReview,
  parseMaterialRoute,
  type MaterialDepartment,
  type MaterialDraft,
  type MaterialReview,
  type MaterialSourceType,
  type MaterialStatus,
} from "./domain";

export type MaterialExtraction = {
  extracted_text: string;
  extraction_meta: Record<string, unknown>;
  visible_sheets: unknown[];
  unreadable: string[];
  is_truncated: boolean;
};

export type MaterialListItem = {
  id: string;
  title: string;
  source_type: MaterialSourceType;
  status: MaterialStatus;
  sanitized_text: string;
  created_at: string;
  updated_at: string;
  departments: MaterialDepartment[];
  route_count: number;
  latest_draft: MaterialDraft | null;
  latest_review: MaterialReview | null;
};

export type MaterialDetail = MaterialListItem & {
  input_text: string | null;
  source_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  redactions: string[];
  extraction: MaterialExtraction | null;
  routes: Array<{
    id: string;
    target: string;
    target_object_id: string | null;
    reason: string;
    output_expectation: string;
    departments: MaterialDepartment[];
    created_at: string;
  }>;
};

export async function listRealityMaterials(
  userId: string
): Promise<MaterialListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_materials")
    .select(
      "id, title, source_type, status, sanitized_text, created_at, updated_at"
    )
    .eq("user_id", userId)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(60);
  if (isMissingMaterialsSchema(error)) return [];
  if (error) throw new Error(error.message);
  return Promise.all((data ?? []).map((row) => enrichListItem(userId, row)));
}

export async function getRealityMaterial(
  userId: string,
  materialId: string
): Promise<MaterialDetail | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_materials")
    .select(
      "id, title, source_type, status, input_text, sanitized_text, source_url, file_name, file_type, file_size, redactions, created_at, updated_at"
    )
    .eq("id", materialId)
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingMaterialsSchema(error)) return null;
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [base, extraction, routes] = await Promise.all([
    enrichListItem(userId, data),
    getExtraction(userId, materialId),
    listRoutes(userId, materialId),
  ]);

  return {
    ...base,
    input_text: (data.input_text as string | null) ?? null,
    source_url: (data.source_url as string | null) ?? null,
    file_name: (data.file_name as string | null) ?? null,
    file_type: (data.file_type as string | null) ?? null,
    file_size: (data.file_size as number | null) ?? null,
    redactions: ((data.redactions as string[] | null) ?? []).filter(Boolean),
    extraction,
    routes,
  };
}

export async function getMaterialsSchemaAvailable(): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("reality_materials")
    .select("id")
    .limit(1);
  return !isMissingMaterialsSchema(error);
}

export const getMaterialsSchemaReady = getMaterialsSchemaAvailable;

async function enrichListItem(
  userId: string,
  row: Record<string, unknown>
): Promise<MaterialListItem> {
  const materialId = row.id as string;
  const [departments, latestDraft, latestReview, routeCount] = await Promise.all([
    listDepartments(userId, materialId),
    getLatestDraft(userId, materialId),
    getLatestReview(userId, materialId),
    countRoutes(userId, materialId),
  ]);
  const title =
    typeof row.title === "string" && row.title.trim()
      ? row.title.trim()
      : "未命名现实材料";
  return {
    id: materialId,
    title,
    source_type: row.source_type as MaterialSourceType,
    status: row.status as MaterialStatus,
    sanitized_text: (row.sanitized_text as string | null) ?? "",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    departments,
    route_count: routeCount,
    latest_draft: latestDraft,
    latest_review: latestReview,
  };
}

async function listDepartments(
  userId: string,
  materialId: string
): Promise<MaterialDepartment[]> {
  const { data, error } = await supabaseAdmin
    .from("reality_material_departments")
    .select("department")
    .eq("user_id", userId)
    .eq("material_id", materialId);
  if (error) return [];
  return (data ?? []).map((row) => row.department as MaterialDepartment);
}

async function getLatestDraft(
  userId: string,
  materialId: string
): Promise<MaterialDraft | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_material_drafts")
    .select("draft")
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return parseMaterialDraft(data.draft);
}

async function getLatestReview(
  userId: string,
  materialId: string
): Promise<MaterialReview | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_material_reviews")
    .select("review")
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return parseMaterialReview(data.review);
}

async function getExtraction(
  userId: string,
  materialId: string
): Promise<MaterialExtraction | null> {
  const { data, error } = await supabaseAdmin
    .from("reality_material_extractions")
    .select(
      "extracted_text, extraction_meta, visible_sheets, unreadable, is_truncated"
    )
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    extracted_text: data.extracted_text as string,
    extraction_meta: (data.extraction_meta as Record<string, unknown>) ?? {},
    visible_sheets: (data.visible_sheets as unknown[] | null) ?? [],
    unreadable: (data.unreadable as string[] | null) ?? [],
    is_truncated: Boolean(data.is_truncated),
  };
}

async function countRoutes(userId: string, materialId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("reality_material_routes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("material_id", materialId);
  return count ?? 0;
}

async function listRoutes(
  userId: string,
  materialId: string
): Promise<MaterialDetail["routes"]> {
  const { data, error } = await supabaseAdmin
    .from("reality_material_routes")
    .select(
      "id, target, target_object_id, reason, output_expectation, source_snapshot, created_at"
    )
    .eq("user_id", userId)
    .eq("material_id", materialId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => {
    const parsed = parseMaterialRoute({
      target: row.target,
      target_id: row.target_object_id,
      departments:
        ((row.source_snapshot as Record<string, unknown> | null)
          ?.departments as string[] | undefined) ?? ["judgment"],
      reason: row.reason,
      snapshot: (row.source_snapshot as Record<string, unknown>) ?? {},
    });
    return {
      id: row.id as string,
      target: parsed.target,
      target_object_id: parsed.target_id ?? null,
      reason: parsed.reason,
      output_expectation: row.output_expectation as string,
      departments: parsed.departments,
      created_at: row.created_at as string,
    };
  });
}

function isMissingMaterialsSchema(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  return (
    message.includes("reality_material") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}
