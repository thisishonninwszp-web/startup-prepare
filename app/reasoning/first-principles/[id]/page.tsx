import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFirstPrinciplesSession } from "@/app/reasoning/queries";
import { FirstPrinciplesWorkspace } from "./first-principles-workspace";

export const dynamic = "force-dynamic";

export default async function FirstPrinciplesSessionPage({
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
  const session = await getFirstPrinciplesSession(id, user.id);
  if (!session) notFound();

  return <FirstPrinciplesWorkspace session={session} />;
}
