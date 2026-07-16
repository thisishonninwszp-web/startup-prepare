import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listSharpestQuestions } from "../queries";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function CouncilQuestionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const questions = await listSharpestQuestions(user!.id);

  return (
    <>
      <PageContainer width="default" className="animate-fade-up">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <MessageCircleQuestion className="size-4" />
            犀利提问墙
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">
            顾问们抛给你的问题，答完了吗？
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            每场会话里最尖锐的那个问题都收在这里。躲开的问题不会消失，只会换个地方等你。
          </p>
          <Link
            href="/council"
            className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            ← 返回顾问团
          </Link>
        </div>

        {questions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            还没有收录任何提问。去顾问团开一场会话，尖锐的问题会自动挂到这面墙上。
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2">
            {questions.map((q, i) => (
              <Link
                key={q.id}
                href={`/council/${q.session_id}`}
                className="group mb-4 block break-inside-avoid rounded-lg border bg-card p-5 transition-colors hover:bg-muted"
                style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
              >
                <p className="font-serif text-base leading-relaxed">
                  “{q.question}”
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {q.persona_name}
                  </span>
                  {q.grounded_reference && (
                    <span className="rounded-full border px-2 py-0.5 text-[10px]">
                      {q.grounded_reference}
                    </span>
                  )}
                  <span className="ml-auto">
                    {new Date(q.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground/70 group-hover:text-muted-foreground">
                  来自：{q.session_title}
                </p>
              </Link>
            ))}
          </div>
        )}
      </PageContainer>
    </>
  );
}
