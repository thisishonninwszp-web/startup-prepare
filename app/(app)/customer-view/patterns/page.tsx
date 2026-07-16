import { createClient } from "@/lib/supabase/server";
import { CustomerNav } from "../customer-nav";
import { listCustomerCases, listCustomerPatternReports } from "../queries";
import { CustomerPatterns } from "./customer-patterns";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function CustomerPatternsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [reports, cases] = await Promise.all([
    listCustomerPatternReports(user!.id),
    listCustomerCases(user!.id),
  ]);
  return (
    <>
      <CustomerNav />
      <PageContainer width="default" className="min-h-screen lg:px-12">
        <h1 className="text-2xl font-semibold tracking-tight">跨课题模式报告</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          从已提取证据中寻找重复处境、行为、阻力与反例。报告不评分；候选机会只有在你主动要求后才生成。
        </p>
        <div className="mt-8">
          <CustomerPatterns initial={reports} cases={cases} />
        </div>
      </PageContainer>
    </>
  );
}
