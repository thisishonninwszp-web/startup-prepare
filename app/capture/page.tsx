import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { CaptureClient, type ObservationCard } from "./capture-client";
import { RecurringSignals } from "./recurring-signals";

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
  const sharedText =
    pick(searchParams.text) || pick(searchParams.url) || pick(searchParams.title);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 中间件已保证已登录；此处 user 必然存在。
  const userId = user!.id;

  // 今天（服务端本地零点起）记录的观察，倒序。
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const { data: observations } = await supabaseAdmin
    .from("observations")
    .select("id, raw_text, tags, created_at")
    .eq("user_id", userId)
    .gte("created_at", startOfToday)
    .order("created_at", { ascending: false });

  const obs = observations ?? [];

  // 拉取这些观察对应的 inquirer 追问。
  const questionsByObs = new Map<string, string[]>();
  if (obs.length > 0) {
    const { data: sessions } = await supabaseAdmin
      .from("ai_sessions")
      .select("observation_id, messages")
      .eq("role", "inquirer")
      .in(
        "observation_id",
        obs.map((o) => o.id)
      );

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
    tags: o.tags ?? [],
    created_at: o.created_at,
    questions: questionsByObs.get(o.id) ?? null,
    inquiryLoading: false,
  }));

  return (
    <AppShell>
      <main className="animate-fade-up mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <CaptureClient initial={initial} initialText={sharedText} />
        <RecurringSignals />
      </main>
    </AppShell>
  );
}
