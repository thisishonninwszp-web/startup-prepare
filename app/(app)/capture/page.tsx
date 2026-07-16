import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { CaptureClient, type ObservationCard } from "./capture-client";
import { RecurringSignals } from "./recurring-signals";
import { isObservationPromoted, visibleTags } from "../ideas/types";

export const dynamic = "force-dynamic";

type SessionMessage = { role: string; content: unknown };

export default async function CapturePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const pick = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";
  // Share Target（GET）分享进来的文字 → 预填捕捉框。
  // URL 例外：网页属于外部世界材料，改道材料箱走抓取+提取管道，不落 observations。
  const sharedUrl = pick(searchParams.url).trim();
  const sharedTextRaw = pick(searchParams.text).trim();
  if (sharedUrl || /^https?:\/\/\S+$/.test(sharedTextRaw)) {
    redirect(
      `/materials?url=${encodeURIComponent(sharedUrl || sharedTextRaw)}`
    );
  }
  const sharedText =
    pick(searchParams.text) || pick(searchParams.title);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 中间件已保证已登录；此处 user 必然存在。
  const userId = user!.id;

  // 最近的捕捉历史，倒序。不要用 Vercel 服务器时区定义“今天”。
  const { data: observations, error: observationsError } = await supabaseAdmin
    .from("observations")
    .select("id, raw_text, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (observationsError) throw new Error(observationsError.message);

  const obs = observations ?? [];

  // 拉取这些观察对应的 inquirer 追问。
  const questionsByObs = new Map<string, string[]>();
  if (obs.length > 0) {
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("ai_sessions")
      .select("observation_id, messages")
      .eq("role", "inquirer")
      .in(
        "observation_id",
        obs.map((o) => o.id)
      );
    if (sessionsError) throw new Error(sessionsError.message);

    for (const s of sessions ?? []) {
      const messages = (s.messages as SessionMessage[]) ?? [];
      const inquiry = messages.find((m) => m.role === "inquirer");
      if (inquiry && Array.isArray(inquiry.content) && s.observation_id) {
        questionsByObs.set(
          s.observation_id as string,
          inquiry.content.filter((q): q is string => typeof q === "string")
        );
      }
    }
  }

  const initial: ObservationCard[] = obs.map((o) => ({
    id: o.id,
    raw_text: o.raw_text,
    tags: visibleTags(o.tags ?? []),
    created_at: o.created_at,
    promoted: isObservationPromoted(o.tags ?? []),
    questions: questionsByObs.get(o.id) ?? null,
    inquiryLoading: false,
  }));

  return (
    <>
      <main className="animate-fade-up mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <CaptureClient initial={initial} initialText={sharedText} />
        <RecurringSignals />
      </main>
    </>
  );
}
