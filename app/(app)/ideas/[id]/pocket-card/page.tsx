import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PrintButton } from "@/components/print-button";
import type { Hypothesis } from "../../types";

export const dynamic = "force-dynamic";

/**
 * 访谈口袋卡：出口舱的第一个产物——打印出来揣兜里去见真人。
 * 问题全部由假设句式模板生成，不经过 AI：卡片上只允许出现你自己写下的假设。
 */
export default async function PocketCardPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: idea, error }, criteriaResult] = await Promise.all([
    supabaseAdmin
      .from("ideas")
      .select("id, title, hypothesis, status, user_id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("idea_exit_criteria")
      .select("criterion")
      .eq("idea_id", params.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);
  if (error) throw new Error(error.message);
  if (!idea) notFound();
  if (criteriaResult.error) throw new Error(criteriaResult.error.message);

  const hyp = (idea.hypothesis ?? {}) as Hypothesis;
  const criteria = (criteriaResult.data ?? []).map(
    (row) => row.criterion as string
  );

  // 问题模板：全部指向过去的真实行为，不指向假设性未来（“你会不会用”是被禁止的问法）。
  const questions = [
    hyp.pain
      ? `最近一次遇到「${hyp.pain}」是什么时候？当时你具体做了什么？`
      : "最近一次遇到这个问题是什么时候？当时你具体做了什么？",
    hyp.alternative
      ? `你现在是用「${hyp.alternative}」来解决的吗？还是别的办法？`
      : "你现在用什么办法解决？",
    "这个办法最让你不满的地方是什么？",
    "你为解决它花过钱或时间吗？大概多少？",
    "上次你主动找过更好的解决方案吗？找到了什么？",
  ];

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 12px; }
          .pocket-card { border: 1.5pt solid #000; break-inside: avoid; }
        }
        @page { margin: 1.5cm; }
      `}</style>

      <div className="mx-auto max-w-md px-4 py-10 text-sm">
        <div className="no-print mb-8 flex items-center justify-between">
          <Link
            href={`/ideas/${idea.id}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← 返回想法
          </Link>
          <PrintButton />
        </div>

        <div className="pocket-card rounded-2xl border-2 border-foreground p-6">
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            访谈口袋卡
          </p>
          <h1 className="mt-2 text-center font-serif text-lg tracking-tight">
            {idea.title?.trim() || "（无标题）"}
          </h1>

          {hyp.riskiest_assumption && (
            <div className="mt-5 rounded-lg bg-muted p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                这次要验证的最险假设
              </p>
              <p className="mt-1 leading-relaxed">{hyp.riskiest_assumption}</p>
            </div>
          )}

          <div className="mt-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              该问的问题（问过去，不问将来）
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed">
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </div>

          <div className="mt-5 rounded-lg border border-destructive/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-destructive">
              绝不能做的事
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed">
              <li>先讲你的方案——一开口对方就只会客气地附和</li>
              <li>问「如果有 X 你会不会用」——假设性回答一文不值</li>
              <li>听到夸奖就满足——夸奖不是证据，付出过的钱和时间才是</li>
            </ul>
          </div>

          {criteria.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                你事先立下的退出条件
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                {criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 border-t pt-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              回来后只记两件事
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border p-2 text-center">
                有真实痛？
                <div className="mt-1 font-mono">是 / 否 / 不确定</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                愿意付钱？
                <div className="mt-1 font-mono">是 / 否 / 不确定</div>
              </div>
            </div>
          </div>
        </div>

        <p className="no-print mt-4 text-center text-xs text-muted-foreground">
          打印后对折，访谈时别拿出手机——看卡片比看屏幕诚恳。
        </p>
      </div>
    </>
  );
}
