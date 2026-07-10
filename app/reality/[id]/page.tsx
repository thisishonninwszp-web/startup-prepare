import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getRealityCase } from "../queries";
import { RealityWorkspace } from "./reality-workspace";
import { getReasoningSourceSchemaStatus } from "@/app/reasoning/reality-source";
import {
  getRealityClosureSchemaStatus,
  listRealityClosures,
} from "../closure-queries";
import {
  getRealityFocusSchemaStatus,
  listRealityFocusSessions,
} from "../focus-queries";
import {
  getDecisionClosureSchemaStatus,
  listDecisionClosuresForObject,
} from "@/app/decision-closures/queries";

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
  if (!user) notFound();
  const [
    realityCase,
    reasoningBridgeAvailable,
    closureAvailable,
    focusAvailable,
    decisionClosureAvailable,
  ] = await Promise.all([
    getRealityCase(params.id, user.id),
    getReasoningSourceSchemaStatus(),
    getRealityClosureSchemaStatus(),
    getRealityFocusSchemaStatus(),
    getDecisionClosureSchemaStatus(),
  ]);
  if (!realityCase) notFound();
  const closures = closureAvailable
    ? await listRealityClosures(realityCase.id, user.id)
    : [];
  const focusSessions = focusAvailable
    ? await listRealityFocusSessions(realityCase.id, user.id)
    : [];
  const decisionClosures = decisionClosureAvailable
    ? await listDecisionClosuresForObject(
        user.id,
        "reality_case",
        realityCase.id
      )
    : [];

  return (
    <AppShell>
      <main className="min-h-screen">
        <RealityWorkspace
          initialCase={realityCase}
          reasoningBridgeAvailable={reasoningBridgeAvailable}
          closureAvailable={closureAvailable}
          closures={closures}
          focusAvailable={focusAvailable}
          focusSessions={focusSessions}
          decisionClosureAvailable={decisionClosureAvailable}
          decisionClosures={decisionClosures}
        />
      </main>
    </AppShell>
  );
}
