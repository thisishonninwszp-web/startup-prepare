import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getDreamCase, listRealityVersionChoices } from "../queries";
import { DreamWorkspace } from "./dream-workspace";

export const dynamic = "force-dynamic";

export default async function DreamCasePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [dreamCase, realityChoices] = await Promise.all([
    getDreamCase(params.id, user!.id),
    listRealityVersionChoices(user!.id),
  ]);
  if (!dreamCase) notFound();
  return (
    <AppShell>
      <DreamWorkspace
        initialCase={dreamCase}
        realityChoices={realityChoices}
      />
    </AppShell>
  );
}
