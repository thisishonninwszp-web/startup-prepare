import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDreamCase, listRealityVersionChoices } from "../queries";
import { DreamWorkspace } from "./dream-workspace";

export const dynamic = "force-dynamic";

export default async function DreamCasePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [dreamCase, realityChoices] = await Promise.all([
    getDreamCase(params.id, user!.id),
    listRealityVersionChoices(user!.id),
  ]);
  if (!dreamCase) notFound();
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <Link
          href={`/workbench/dream_branch/${dreamCase.focused_branch.id}`}
          className="inline-flex rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          在决策工作台打开
        </Link>
      </div>
      <DreamWorkspace
        initialCase={dreamCase}
        realityChoices={realityChoices}
      />
    </>
  );
}
