import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDreamCase } from "../../queries";
import { DreamBranchComparison } from "./dream-branch-comparison";

export const dynamic = "force-dynamic";

export default async function DreamComparePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const dreamCase = await getDreamCase(params.id, user!.id);
  if (!dreamCase || dreamCase.branches.length < 2) notFound();
  return (
    <>
      <DreamBranchComparison dreamCase={dreamCase} />
    </>
  );
}
