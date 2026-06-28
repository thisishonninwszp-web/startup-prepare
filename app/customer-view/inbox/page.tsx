import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CustomerNav } from "../customer-nav";
import { listCustomerMaterials } from "../queries";
import { CustomerInbox } from "./customer-inbox";

export const dynamic = "force-dynamic";

export default async function CustomerInboxPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const materials = await listCustomerMaterials(user!.id, "candidate");
  return (
    <AppShell>
      <CustomerNav />
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8 lg:px-12">
        <h1 className="text-2xl font-semibold tracking-tight">候选收件箱</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          快速排除无关材料。只有你明确保留的内容才会进入证据提取和顾客代理。
        </p>
        <div className="mt-8">
          <CustomerInbox initial={materials} />
        </div>
      </main>
    </AppShell>
  );
}
