import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DreamVisionCard } from "../../../../../dream-vision-card";
import {
  getDreamBranchVersion,
  getDreamCase,
} from "../../../../../queries";

export const dynamic = "force-dynamic";

export default async function DreamBranchVersionPage({
  params,
}: {
  params: { id: string; branchId: string; version: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [dreamCase, result] = await Promise.all([
    getDreamCase(params.id, user!.id),
    getDreamBranchVersion(
      params.id,
      params.branchId,
      Number(params.version),
      user!.id
    ),
  ]);
  if (!dreamCase || !result) notFound();
  const { branch, version } = result;
  return (
    <>
      <main className="min-h-screen bg-[#f4f1ea] px-4 py-8 text-stone-950 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <Link
            href={`/dreams/${dreamCase.id}`}
            className="inline-flex items-center gap-2 text-xs text-stone-500"
          >
            <ArrowLeft className="size-3" />
            返回 {dreamCase.title}
          </Link>
          <div className="mt-8 border-b border-stone-300 pb-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
              {branch.name} · archived vision {version.version_no}
            </p>
            <h1 className="mt-3 font-serif text-3xl">{dreamCase.title}</h1>
            <p className="mt-2 text-xs text-stone-500">
              {new Date(version.created_at).toLocaleString("zh-CN")}
            </p>
          </div>
          <div className="mt-8">
            <DreamVisionCard vision={version.vision} delta={version.delta} />
          </div>
        </div>
      </main>
    </>
  );
}
