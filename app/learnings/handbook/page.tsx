import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PrintButton } from "@/components/print-button";

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

type Entry = {
  id: string;
  title: string;
  learned: string | null;
  reason: ReasonParts;
  decided_at: string;
};

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default async function LearningsHandbookPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-muted-foreground">
        请先登录。
      </div>
    );
  }

  const { data: rows, error } = await supabaseAdmin
    .from("decisions")
    .select("id, reason, learned, decided_at, ideas!inner(title, user_id)")
    .eq("verdict", "Kill")
    .eq("ideas.user_id", user.id)
    .order("decided_at", { ascending: true });
  if (error) throw new Error(error.message);

  const entries: Entry[] = (rows ?? []).map((r) => {
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

  // 按月分组（时间正序：手册从最早的教训读起）
  const groups: { month: string; items: Entry[] }[] = [];
  for (const entry of entries) {
    const key = monthKey(entry.decided_at);
    const last = groups[groups.length - 1];
    if (last && last.month === key) last.items.push(entry);
    else groups.push({ month: key, items: [entry] });
  }

  const firstDate = entries[0]?.decided_at;
  const lastDate = entries[entries.length - 1]?.decided_at;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 13px; }
          .handbook-entry { break-inside: avoid; }
          .handbook-month { break-after: avoid; }
        }
        @page { margin: 2cm; }
      `}</style>

      <div className="mx-auto max-w-2xl px-6 py-10 text-sm">
        <div className="no-print mb-10 flex items-center justify-between">
          <Link
            href="/learnings"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← 返回判断复盘
          </Link>
          <PrintButton />
        </div>

        <header className="mb-14 text-center">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            IdeaOS · 决策教训集
          </p>
          <h1 className="mt-4 font-serif text-3xl tracking-tight">学到了什么</h1>
          {firstDate && lastDate && (
            <p className="mt-3 text-xs text-muted-foreground">
              {new Date(firstDate).toLocaleDateString("zh-CN")} —{" "}
              {new Date(lastDate).toLocaleDateString("zh-CN")} · 共{" "}
              {entries.length} 条
            </p>
          )}
          <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-muted-foreground">
            这本册子里的每一条，都来自一个被归档的想法。
            记下它们不是为了纪念，是为了下次更早看清同类机会。
          </p>
        </header>

        {entries.length === 0 ? (
          <p className="text-center text-muted-foreground">
            还没有归档的想法，册子暂时是空的。
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.month} className="mb-12">
              <h2 className="handbook-month mb-6 border-b pb-2 font-serif text-lg">
                {group.month}
              </h2>
              <div className="space-y-8">
                {group.items.map((entry) => (
                  <article key={entry.id} className="handbook-entry">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-medium">{entry.title}</h3>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(entry.decided_at).toLocaleDateString("zh-CN")}
                      </span>
                    </div>

                    {entry.learned && (
                      <p className="mt-3 border-l-2 border-foreground/30 pl-4 font-serif text-base italic leading-relaxed">
                        {entry.learned}
                      </p>
                    )}

                    <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      {entry.reason.original_judgment && (
                        <div>
                          <dt className="inline font-medium">原始判断：</dt>
                          <dd className="inline">{entry.reason.original_judgment}</dd>
                        </div>
                      )}
                      {entry.reason.validation_action && (
                        <div>
                          <dt className="inline font-medium">验证动作：</dt>
                          <dd className="inline">{entry.reason.validation_action}</dd>
                        </div>
                      )}
                      {entry.reason.real_result && (
                        <div>
                          <dt className="inline font-medium">真实结果：</dt>
                          <dd className="inline">{entry.reason.real_result}</dd>
                        </div>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
