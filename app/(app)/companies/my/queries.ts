import { supabaseAdmin } from "@/lib/supabase";

export type OwnCompanyProfile = {
  id: string;
  display_name: string;
  updated_at: string;
};

export type BusinessPlanImportListItem = {
  id: string;
  version_no: number;
  status: "uploading" | "extracting" | "awaiting_confirmation" | "completed" | "failed";
  file_name: string;
  visible_sheet_count: number;
  chunk_count: number;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function getOwnCompanyProfile(
  userId: string
): Promise<OwnCompanyProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("own_company_profiles")
    .select("id, display_name, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("读取内部公司档案失败");
  return data as OwnCompanyProfile | null;
}

export async function listBusinessPlanImports(
  userId: string,
  profileId: string
): Promise<BusinessPlanImportListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("business_plan_imports")
    .select(
      "id, version_no, status, file_name, visible_sheet_count, chunk_count, error_code, created_at, completed_at"
    )
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .order("version_no", { ascending: false });
  if (error) throw new Error("读取经营计划版本失败");
  return (data ?? []) as BusinessPlanImportListItem[];
}
