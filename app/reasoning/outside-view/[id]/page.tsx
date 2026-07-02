import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOutsideViewSession } from "@/app/reasoning/queries";
import { OutsideViewWorkspace } from "./outside-view-workspace";

export const dynamic = "force-dynamic";

export default async function OutsideViewSessionPage({
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
  const session = await getOutsideViewSession(id, user.id);
  if (!session) notFound();

  return <OutsideViewWorkspace session={session} />;
}
