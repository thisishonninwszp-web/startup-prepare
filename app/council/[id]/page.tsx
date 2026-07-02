import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getCouncilSession, listCouncilPersonas } from "@/app/council/queries";
import { CouncilChat } from "./council-chat";

export const dynamic = "force-dynamic";

export default async function CouncilSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { id } = await params;
  const [session, personas] = await Promise.all([
    getCouncilSession(id, user.id),
    listCouncilPersonas(user.id),
  ]);
  if (!session) notFound();

  const personaByKey = new Map(personas.map((p) => [p.key, p]));

  return (
    <AppShell>
      <CouncilChat session={session} personaByKey={Object.fromEntries(personaByKey)} />
    </AppShell>
  );
}
