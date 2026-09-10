import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { getSelfRecord } from "@/lib/domains/decision-self/queries";
import { parseSource, SOURCE_LABELS } from "@/lib/domains/decision-self/domain";

export const dynamic = "force-dynamic";

export default async function SelfRecordPage({ params }: { params: { sourceType: string; sourceId: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) notFound();
  let source;
  try { source = parseSource(params.sourceType, params.sourceId); }
  catch { notFound(); }
  const record = await getSelfRecord(user.id, source);
  if (!record) notFound();
  return <PageContainer width="default" className="space-y-5">
    <Link href="/self" className="text-sm underline">回到自我</Link>
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">{SOURCE_LABELS[record.type]} · {record.date}</p>
      <h1 className="text-2xl font-semibold">{record.title}</h1>
    </header>
    <p className="whitespace-pre-wrap break-words rounded-lg border bg-card p-5 text-sm">{record.text}</p>
    <p className="text-sm text-muted-foreground">这里展示当前原记录。一次经历有它的情境，使用时请确认它与眼前的选择是否有关。</p>
  </PageContainer>;
}
