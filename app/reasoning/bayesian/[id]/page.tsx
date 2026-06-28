import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBayesianBelief } from "@/app/reasoning/queries";
import { BayesianWorkspace } from "./bayesian-workspace";

export default async function BayesianBeliefPage({
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

  const belief = await getBayesianBelief(id, user.id);
  if (!belief) notFound();

  return <BayesianWorkspace belief={belief} />;
}
