import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDailyReflection, getReflectionSettings } from "../../queries";
import { DailyReflectionWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function DailyReflectionPage({
  params,
}: {
  params: { date: string };
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) notFound();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [reflection, settings] = await Promise.all([
    getDailyReflection(user!.id, params.date),
    getReflectionSettings(user!.id),
  ]);
  return (
    <>
      <DailyReflectionWorkspace
        date={params.date}
        initialReflection={reflection}
        settings={settings}
      />
    </>
  );
}
