import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { getBayesianBelief } from "@/app/reasoning/queries";
import { BayesianWorkspace } from "./bayesian-workspace";
import { getReasoningSource } from "../../reality-source";

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

  const [belief, realitySource] = await Promise.all([
    getBayesianBelief(id, user.id),
    getReasoningSource("bayesian", id, user.id),
  ]);
  if (!belief) notFound();

  return <BayesianWorkspace belief={belief} realitySource={realitySource} />;
}
