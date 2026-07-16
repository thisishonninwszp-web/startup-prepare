import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerNav } from "../customer-nav";
import {
  getCustomerCaseDetail,
  listCustomerIdeas,
} from "../queries";
import { CustomerWorkspace } from "./customer-workspace";
import { PageContainer } from "@/components/ui/page-container";

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
    <>
      <CustomerNav />
      <main className="min-h-screen">
        <PageContainer width="default" className="pt-4">
          <Link
            href={`/workbench/customer_case/${customerCase.id}`}
            className="inline-flex rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            在决策工作台打开
          </Link>
        </PageContainer>
        <CustomerWorkspace initialCase={customerCase} ideas={ideas} />
      </main>
    </>
  );
}
