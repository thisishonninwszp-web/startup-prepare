import Link from "next/link";
import { ArrowRight, MessagesSquare, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { listCouncilSessions } from "./queries";

export const dynamic = "force-dynamic";

export default async function CouncilPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sessions = await listCouncilSessions(user!.id);

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <MessagesSquare className="size-4" />
              顾问团
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              把想法拿给几位真实历史人物来质疑
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              每场对话按需邀请几位顾问，AI 只运用他们公开可考的方法论来发言——不是啦啦队，也不代表本人真实观点。
            </p>
            <Link
              href="/council/questions"
              className="mt-2 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              犀利提问墙 →
            </Link>
          </div>
          <Link
            href="/council/new"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm text-background"
          >
            <Plus className="size-4" />
            新建会话
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            还没有顾问团会话。开始一场，邀请几位顾问就可以聊了。
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/council/${session.id}`}
                className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {session.title || "未命名会话"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(session.created_at).toLocaleDateString("zh-CN")}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
