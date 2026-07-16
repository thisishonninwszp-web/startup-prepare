import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRetroPeriod } from "../../queries";
import { WeeklyRetrospectiveWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function WeeklyRetrospectivePage({
  params,
}: {
  params: { period: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const period = await getRetroPeriod(params.period, user!.id);
  if (!period || period.period_type !== "weekly") notFound();
  return (
    <>
      <WeeklyRetrospectiveWorkspace initialPeriod={period} />
    </>
  );
}
