import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CustomerNav } from "../customer-nav";
import {
  getCustomerCaseDetail,
  listCustomerIdeas,
} from "../queries";
import { CustomerWorkspace } from "./customer-workspace";

export const dynamic = "force-dynamic";

export default async function CustomerCasePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [customerCase, ideas] = await Promise.all([
    getCustomerCaseDetail(params.id, user!.id),
    listCustomerIdeas(user!.id),
  ]);
  if (!customerCase) notFound();

  return (
    <AppShell>
      <CustomerNav />
      <main className="min-h-screen">
        <CustomerWorkspace initialCase={customerCase} ideas={ideas} />
      </main>
    </AppShell>
  );
}
