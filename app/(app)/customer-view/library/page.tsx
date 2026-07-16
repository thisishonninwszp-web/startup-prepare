import { createClient } from "@/lib/supabase/server";
import { CustomerNav } from "../customer-nav";
import { listCustomerMaterials } from "../queries";
import { CustomerLibrary } from "./customer-library";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function CustomerLibraryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const materials = await listCustomerMaterials(user!.id, "kept");
  return (
    <>
      <CustomerNav />
      <PageContainer width="wide" className="min-h-screen lg:px-12">
        <h1 className="text-2xl font-semibold tracking-tight">跨课题证据库</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          这里保存的是经你审核的顾客材料关联。它们可以被不同研究课题复用，但始终保留来源和市场。
        </p>
        <div className="mt-8">
          <CustomerLibrary materials={materials} />
        </div>
      </PageContainer>
    </>
  );
}
