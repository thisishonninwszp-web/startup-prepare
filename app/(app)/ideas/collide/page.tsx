import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { CollideForm } from "./collide-form";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function IdeaColliderPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: ideas, error } = await supabaseAdmin
    .from("ideas")
    .select("id, title")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const options = (ideas ?? []).map((i) => ({
    id: i.id as string,
    title: (i.title as string | null)?.trim() || "（无标题）",
  }));

  return (
    <>
      <PageContainer width="narrow">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">想法对撞机</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          挑两个想法，看它们之间藏着什么你没意识到的联系——不是比哪个更好。
        </p>
        <CollideForm options={options} />
      </PageContainer>
    </>
  );
}
