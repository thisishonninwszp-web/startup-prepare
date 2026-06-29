import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getRealityCase } from "../queries";
import { RealityWorkspace } from "./reality-workspace";
import { getReasoningSourceSchemaStatus } from "@/app/reasoning/reality-source";

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
  const [realityCase, reasoningBridgeAvailable] = await Promise.all([
    getRealityCase(params.id, user!.id),
    getReasoningSourceSchemaStatus(),
  ]);
  if (!realityCase) notFound();

  return (
    <AppShell>
      <main className="min-h-screen">
        <RealityWorkspace
          initialCase={realityCase}
          reasoningBridgeAvailable={reasoningBridgeAvailable}
        />
      </main>
    </AppShell>
  );
}
