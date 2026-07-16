import { createClient } from "@/lib/supabase/server";
import { CustomerNav } from "../customer-nav";
import { listCustomerIdeas } from "../queries";
import { NewCustomerCaseForm } from "./new-customer-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerCasePage({
  searchParams,
}: {
  searchParams: { ideaId?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ideas = await listCustomerIdeas(user!.id);

  return (
    <>
      <CustomerNav />
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-8 lg:py-14">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          New customer research case
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
          先写下你的偏见。
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          “暂定顾客”和“我原先以为”都不是事实。它们是之后要被真实材料检查的起点。
        </p>
        <div className="mt-10">
          <NewCustomerCaseForm
            ideas={ideas}
            initialIdeaId={searchParams.ideaId ?? ""}
          />
        </div>
      </main>
    </>
  );
}
