import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getReflectionSettings, todayInTimezone } from "@/app/retrospectives/queries";
import {
  DECISION_OBJECT_TYPES,
  type WorkbenchObjectType,
} from "../../domain";
import { recommendFrameworks } from "../../framework-router";
import { getWorkbenchDetail } from "../../queries";
import { FrameworkRecommendations } from "../../framework-recommendations";
import { ClosureList, ObjectSummary } from "../../object-summary";

export const dynamic = "force-dynamic";

export default async function WorkbenchDetailPage({
  params,
}: {
  params: { objectType: string; objectId: string };
}) {
  const objectType = params.objectType as WorkbenchObjectType;
  if (!DECISION_OBJECT_TYPES.includes(objectType)) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const settings = await getReflectionSettings(user.id);
  const today = todayInTimezone(settings.timezone);
  const detail = await getWorkbenchDetail(
    user.id,
    objectType,
    params.objectId,
    today
  );
  if (!detail) notFound();
  const recommendations = recommendFrameworks(detail.signal);

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
        <ObjectSummary detail={detail} today={today} />
        <FrameworkRecommendations cards={recommendations} />
        <ClosureList closures={detail.closures} />
      </main>
    </AppShell>
  );
}
