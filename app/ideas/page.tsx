import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { IdeasBoard } from "./ideas-board";
import { visibleTags, type Idea } from "./types";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: ideas, error } = await supabaseAdmin
    .from("ideas")
    .select("id, title, status, tags, created_at, last_activity_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const initial = (ideas ?? []).map((i) => ({
    ...i,
    tags: visibleTags(i.tags ?? []),
  })) as Idea[];

  return (
    <AppShell>
      <main className="animate-fade-up px-4 py-6 sm:px-6">
        <div className="mb-4 flex justify-end">
          <Link
            href="/ideas/collide"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            想法对撞机 →
          </Link>
        </div>
        {initial.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有想法。去{" "}
            <Link href="/capture" className="text-primary underline-offset-4 hover:underline">
              捕捉页
            </Link>{" "}
            把一条观察提升为想法。
          </p>
        ) : (
          <IdeasBoard initial={initial} />
        )}
      </main>
    </AppShell>
  );
}
