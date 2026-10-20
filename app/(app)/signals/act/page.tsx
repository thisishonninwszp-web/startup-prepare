import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadActState } from "@/lib/domains/signals/act";
import { ActView } from "./act-view";

export const dynamic = "force-dynamic";

/**
 * 本周行动：外部信号读了很多，这一页只问一件事 —— 这周往前推哪一格。
 * 由代码按现在的状态排，只给一件最该做的（防你挑容易的做），后面再列几件；只数次数。
 */
export default async function ActPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  return <ActView state={await loadActState(user.id)} />;
}
