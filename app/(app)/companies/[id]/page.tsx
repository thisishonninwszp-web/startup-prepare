import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyDetail } from "@/app/(app)/knowledge/queries";
import { COMPANY_TYPES } from "@/app/(app)/knowledge/types";
import { CompanyDetailClient } from "./company-detail-client";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const company = await getCompanyDetail(params.id, user.id);
  if (!company) notFound();

  return <CompanyDetailClient company={company} companyTypes={COMPANY_TYPES} />;
}
