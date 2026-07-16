import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getConceptSchemaStatus,
  getConceptWorkspaceDetail,
} from "@/lib/domains/concepts/queries";
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

  const available = await getConceptSchemaStatus();
  if (!available) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h1 className="text-lg font-semibold">价值设计图暂未启用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            数据库迁移尚未完成。现有想法和其他工具不受影响。
          </p>
        </main>
      </>
    );
  }

  const detail = await getConceptWorkspaceDetail(params.id, user.id);
  if (!detail) notFound();

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <ConceptWorkspace detail={detail} />
      </main>
    </>
  );
}
