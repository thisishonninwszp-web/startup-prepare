import { createClient } from "@/lib/supabase/server";
import { RetroNav } from "../retro-nav";
import { getReflectionSettings } from "../queries";
import { ReflectionSettingsForm } from "./settings-form";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function ReflectionSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const settings = await getReflectionSettings(user!.id);
  return (
    <>
      <RetroNav />
      <PageContainer width="default">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Reflection protocol
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          定义你的时间，不让系统替你定义。
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          灰色时间只按你的规则产生。恢复、关系和生活维护默认都是正当时间。
        </p>
        <ReflectionSettingsForm initial={settings} />
      </PageContainer>
    </>
  );
}
