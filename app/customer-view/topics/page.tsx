import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CustomerNav } from "../customer-nav";
import { listCustomerTopics } from "../queries";
import { CustomerTopics } from "./customer-topics";

export const dynamic = "force-dynamic";

export default async function CustomerTopicsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const topics = await listCustomerTopics(user!.id);
  return (
    <AppShell>
      <CustomerNav />
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8 lg:px-12">
        <h1 className="text-2xl font-semibold tracking-tight">定期研究主题</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          默认每周收集一次新材料；正在验证的课题可以改为每日。所有结果仍需进入候选收件箱审核。
        </p>
        <div className="mt-8">
          <CustomerTopics initial={topics} />
        </div>
      </main>
    </AppShell>
  );
}
