import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getDreamBranchVersion,
  getOriginalDreamBranch,
} from "../../../queries";

export const dynamic = "force-dynamic";

export default async function LegacyDreamVersionPage({
  params,
}: {
  params: { id: string; version: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const originalId = await getOriginalDreamBranch(params.id, user!.id);
  if (!originalId) notFound();
  const result = await getDreamBranchVersion(
    params.id,
    originalId,
    Number(params.version),
    user!.id
  );
  if (!result) notFound();
  redirect(
    `/dreams/${params.id}/branches/${originalId}/versions/${result.version.version_no}`
  );
}
