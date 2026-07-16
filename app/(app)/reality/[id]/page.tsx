import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRealityCase } from "../queries";
import { RealityWorkspace } from "./reality-workspace";
import { getReasoningSourceSchemaStatus } from "@/app/(app)/reasoning/reality-source";
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
} from "@/lib/domains/closures/queries";

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
    <>
      <main className="min-h-screen">
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
          <Link
            href={`/workbench/reality_case/${realityCase.id}`}
            className="inline-flex rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            在决策工作台打开
          </Link>
        </div>
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
    </>
  );
}
