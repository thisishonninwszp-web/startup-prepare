import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getRealityCase } from "../queries";
import { RealityWorkspace } from "./reality-workspace";

export const dynamic = "force-dynamic";

export default async function RealityCasePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const realityCase = await getRealityCase(params.id, user!.id);
  if (!realityCase) notFound();

  return (
    <AppShell>
      <main className="min-h-screen">
        <RealityWorkspace initialCase={realityCase} />
      </main>
    </AppShell>
  );
}
