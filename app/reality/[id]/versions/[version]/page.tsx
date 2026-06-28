import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getRealityCase } from "../../../queries";
import { RealityMapView } from "../../reality-map";

export const dynamic = "force-dynamic";

export default async function RealityVersionPage({
  params,
}: {
  params: { id: string; version: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const realityCase = await getRealityCase(params.id, user!.id);
  if (!realityCase) notFound();
  const version = realityCase.versions.find(
    (item) => item.id === params.version
  );
  if (!version) notFound();

  return (
    <AppShell>
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-8 lg:py-12">
        <Link
          href={`/reality/${params.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          返回课题
        </Link>
        <header className="my-8 border-b pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Immutable snapshot · V{version.version_no}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {realityCase.title}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            生成于 {new Date(version.created_at).toLocaleString("zh-CN")}
          </p>
        </header>
        <RealityMapView
          map={version.map}
          delta={version.delta}
          selectedPath={version.selected_path}
          customAction={version.custom_action}
          selectionReason={version.selection_reason}
          reviewDueAt={version.review_due_at}
        />
      </main>
    </AppShell>
  );
}
