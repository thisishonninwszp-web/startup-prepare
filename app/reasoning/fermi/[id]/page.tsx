import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFermiEstimate } from "@/app/reasoning/queries";
import { FermiWorkspace } from "./fermi-workspace";

export default async function FermiEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const estimate = await getFermiEstimate(id, user.id);
  if (!estimate) notFound();

  return <FermiWorkspace estimate={estimate} />;
}
