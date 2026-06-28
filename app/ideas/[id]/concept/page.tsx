import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getConceptWorkspaceDetail } from "@/app/concepts/queries";
import { ConceptWorkspace } from "./concept-workspace";

export const dynamic = "force-dynamic";

export default async function ConceptPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const detail = await getConceptWorkspaceDetail(params.id, user.id);
  if (!detail) notFound();

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <ConceptWorkspace detail={detail} />
      </main>
    </AppShell>
  );
}
