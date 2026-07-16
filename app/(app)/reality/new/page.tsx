import { createClient } from "@/lib/supabase/server";
import { listRealitySourceOptions } from "../queries";
import { NewRealityForm } from "./reality-form";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function NewRealityPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sources = await listRealitySourceOptions(user!.id);

  return (
    <>
      <PageContainer width="default" className="min-h-screen lg:py-12">
        <div className="mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            New reality case
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            你现在真正想看清什么？
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            不用先给出完整答案。写下你目前相信的情况，后面会逐层检查它的依据。
          </p>
        </div>
        <NewRealityForm sources={sources} />
      </PageContainer>
    </>
  );
}
