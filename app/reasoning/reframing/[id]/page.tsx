import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReframingSession } from "@/app/reasoning/queries";
import { getConceptSchemaStatus } from "@/app/concepts/queries";
import { ReframingWorkspace } from "./reframing-workspace";

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

  const [session, centralQuestionAvailable] = await Promise.all([
    getReframingSession(id, user.id),
    getConceptSchemaStatus(),
  ]);
  if (!session) notFound();

  return (
    <ReframingWorkspace
      session={session}
      centralQuestionAvailable={centralQuestionAvailable}
    />
  );
}
