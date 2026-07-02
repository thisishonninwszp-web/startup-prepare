import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnCompanyProfile } from "../queries";
import { ImportWorkspace } from "./import-workspace";

export const dynamic = "force-dynamic";

export default async function BusinessPlanImportPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await getOwnCompanyProfile(user.id);
  if (!profile) redirect("/companies/my");

  return (
    <ImportWorkspace
      profileId={profile.id}
      companyName={profile.display_name}
    />
  );
}
