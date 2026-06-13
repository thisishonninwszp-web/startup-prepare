import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

type ReasonParts = {
  original_judgment?: string;
  validation_action?: string;
  real_result?: string;
};

function parseReason(reason: string | null): ReasonParts {
  if (!reason) return {};
  try {
    return JSON.parse(reason) as ReasonParts;
  } catch {
    return {};
  }
}

export default async function LearningsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: rows } = await supabaseAdmin
    .from("decisions")
    .select("id, reason, learned, decided_at, ideas!inner(title, user_id)")
    .eq("verdict", "Kill")
    .eq("ideas.user_id", userId)
    .order("decided_at", { ascending: false });

  const learnings = (rows ?? []).map((r) => {
    // 嵌套关系在 PostgREST 里可能是对象或单元素数组，做个兼容。
    const ideaRel = r.ideas as unknown;
    const idea = Array.isArray(ideaRel) ? ideaRel[0] : ideaRel;
    return {
      id: r.id as string,
      title: (idea?.title as string) ?? "（无标题）",
      learned: r.learned as string | null,
      reason: parseReason(r.reason as string | null),
      decided_at: r.decided_at as string,
    };
  });

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-6 text-sm text-muted-foreground">
          归档过的想法和你从中学到的判断力。回看它们，是为了下次更早识别同类机会。
        </p>

        {learnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有归档的想法。这里会汇总你 Kill 掉的想法和“学到了什么”。
          </p>
        ) : (
          <ul className="space-y-4">
            {learnings.map((l) => (
              <li key={l.id} className="rounded-lg border p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-medium">{l.title}</h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(l.decided_at).toLocaleDateString()}
                  </span>
                </div>

                {l.learned && (
                  <div className="mt-3 rounded-md bg-muted/40 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      学到什么
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{l.learned}</p>
                  </div>
                )}

                <dl className="mt-3 space-y-2 text-sm">
                  {l.reason.original_judgment && (
                    <Row label="原始判断" value={l.reason.original_judgment} />
                  )}
                  {l.reason.validation_action && (
                    <Row label="验证动作" value={l.reason.validation_action} />
                  )}
                  {l.reason.real_result && (
                    <Row label="真实结果" value={l.reason.real_result} />
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
