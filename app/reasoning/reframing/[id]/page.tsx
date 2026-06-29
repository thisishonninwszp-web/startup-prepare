import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { getReframingSession } from "@/app/reasoning/queries";
import { getConceptSchemaStatus } from "@/app/concepts/queries";
import { ReframingWorkspace } from "./reframing-workspace";
import { getReasoningSource } from "../../reality-source";

export default async function ReframingSessionPage({
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

  const [session, centralQuestionAvailable, realitySource] = await Promise.all([
    getReframingSession(id, user.id),
    getConceptSchemaStatus(),
    getReasoningSource("reframing", id, user.id),
  ]);
  if (!session) notFound();

  return (
    <ReframingWorkspace
      session={session}
      centralQuestionAvailable={centralQuestionAvailable}
      realitySource={realitySource}
    />
  );
}
