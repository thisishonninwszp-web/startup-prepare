import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listBayesianBeliefs,
  listFermiEstimates,
  listReframingSessions,
  getMarkedFramePatterns,
} from "./queries";

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function formatNum(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

const FRAME_LABELS: Record<string, string> = {
  time_compress: "时间压缩", time_expand: "时间拉长",
  time_origin: "追溯起点", time_retrospect: "未来回望",
  space_zoom_in: "放大局部", space_zoom_out: "缩小至系统",
  person_opponent: "换位对手", person_beginner: "初学者视角", person_expert: "领域专家",
  meaning_intent: "积极意图", meaning_rebuild: "意义重建", meaning_criteria: "标准切换",
  assumption_flip: "反向假设", redefine_problem: "重新定义问题", second_order: "第二序改变",
  resource_reframe: "资源重估", consequence_extend: "后果延伸", ecology_check: "生态影响",
  emotion_separate: "情绪与事实分离", apply_to_friend: "智慧朋友框架",
  stoic_control: "斯多葛控制二分", narrative_reframe: "叙事版本重写",
  pattern_recognition: "反复模式识别", minimum_viable_move: "最小行动一步",
  leverage_point: "系统杠杆点", gift_frame: "困境赠礼",
};

type Insight = {
  kind: "low" | "high" | "blindspot";
  text: string;
  href: string;
};

export default async function ReasoningPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [beliefs, estimates, sessions] = await Promise.all([
    listBayesianBeliefs(user.id),
    listFermiEstimates(user.id),
    listReframingSessions(user.id),
  ]);

  const sessionIds = sessions.map((s) => s.id);
  const markedFramePatterns = await getMarkedFramePatterns(sessionIds);

  // Compute cross-tool insights (max 3, priority: low confidence > high confidence > blind spot)
  const insights: Insight[] = [];

  for (const b of beliefs.filter((b) => b.current_posterior < 0.2)) {
    if (insights.length >= 3) break;
    const q = b.question.length > 28 ? b.question.slice(0, 28) + "…" : b.question;
    insights.push({
      kind: "low",
      text: `「${q}」的信念已跌至 ${pct(b.current_posterior)}，这个假设可能需要重新评估`,
      href: `/reasoning/bayesian/${b.id}`,
    });
  }

  for (const b of beliefs.filter((b) => b.current_posterior > 0.8)) {
    if (insights.length >= 3) break;
    const q = b.question.length > 28 ? b.question.slice(0, 28) + "…" : b.question;
    insights.push({
      kind: "high",
      text: `「${q}」的信念已达 ${pct(b.current_posterior)}，可以做决策了吗？`,
      href: `/reasoning/bayesian/${b.id}`,
    });
  }

  for (const p of markedFramePatterns.filter((p) => p.count >= 3)) {
    if (insights.length >= 3) break;
    const label = FRAME_LABELS[p.frame_type] ?? p.frame_type;
    insights.push({
      kind: "blindspot",
      text: `你已 ${p.count} 次标记「${label}」视角——这可能是你的认知盲区`,
      href: `/reasoning/reframing/new`,
    });
  }

  const insightColors = {
    low: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
    high: "border-l-green-500 bg-green-50 dark:bg-green-950/20",
    blindspot: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">推理工具</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          三个对抗直觉错误的思维工具。
        </p>
      </div>

      {insights.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">洞见</p>
          {insights.map((insight, i) => (
            <Link
              key={i}
              href={insight.href}
              className={`flex items-center justify-between gap-3 rounded-md border-l-2 px-3 py-2.5 text-xs hover:opacity-80 ${insightColors[insight.kind]}`}
            >
              <span className="leading-relaxed">{insight.text}</span>
              <span className="shrink-0 text-muted-foreground">查看 →</span>
            </Link>
          ))}
        </div>
      )}

      <p className="mb-4 text-xs text-muted-foreground">
        在做现状分析、收集验证、或想法陷入僵局时最有用。
      </p>

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
        <div className="rounded-md bg-muted/50 px-3 py-2.5">
          <p className="font-medium mb-0.5">贝叶斯——何时用？</p>
          <p className="text-muted-foreground leading-relaxed">
            当你有一个关键假设（比如 X% 的用户有这个痛），并且开始收集验证证据时。用它强制声明看到证据前你有多相信，防止事后诸葛亮和确认偏误。
          </p>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2.5">
          <p className="font-medium mb-0.5">费米——何时用？</p>
          <p className="text-muted-foreground leading-relaxed">
            当你需要估算一个大数字——市场规模、开发周期、成本——但没有现成数据时。把问题拆成几个小问题相乘，比直接猜总数可靠得多。
          </p>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2.5">
          <p className="font-medium mb-0.5">重构——何时用？</p>
          <p className="text-muted-foreground leading-relaxed">
            当你对某个课题一时不知道怎么办，或者感觉陷入了同一个思路绕不出去时。26 种视角强制你从不同角度看同一件事。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Bayesian */}
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold">贝叶斯信念追踪</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              先写下你相信什么，再用证据更新它。防止事后诸葛亮。
            </p>
          </div>
          <div className="flex-1">
            {beliefs.length === 0 ? (
              <p className="text-xs text-muted-foreground">还没有信念记录</p>
            ) : (
              <ul className="space-y-2">
                {beliefs.slice(0, 3).map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/reasoning/bayesian/${b.id}`}
                      className="group block rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <p className="text-xs font-medium line-clamp-1 group-hover:underline">
                        {b.question}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        当前概率：{pct(b.current_posterior)}
                      </p>
                    </Link>
                  </li>
                ))}
                {beliefs.length > 3 && (
                  <li className="text-[10px] text-muted-foreground px-2">
                    还有 {beliefs.length - 3} 条…
                  </li>
                )}
              </ul>
            )}
          </div>
          <Link
            href="/reasoning/bayesian/new"
            className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
          >
            新建信念
          </Link>
        </div>

        {/* Fermi */}
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold">费米估算</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              把大数字拆解成可相乘的小组成部分。防止直觉猜测。
            </p>
          </div>
          <div className="flex-1">
            {estimates.length === 0 ? (
              <p className="text-xs text-muted-foreground">还没有估算记录</p>
            ) : (
              <ul className="space-y-2">
                {estimates.slice(0, 3).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/reasoning/fermi/${e.id}`}
                      className="group block rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <p className="text-xs font-medium line-clamp-1 group-hover:underline">
                        {e.question}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatNum(e.final_low)} – {formatNum(e.final_high)}{" "}
                        {e.unit}
                      </p>
                    </Link>
                  </li>
                ))}
                {estimates.length > 3 && (
                  <li className="text-[10px] text-muted-foreground px-2">
                    还有 {estimates.length - 3} 条…
                  </li>
                )}
              </ul>
            )}
          </div>
          <Link
            href="/reasoning/fermi/new"
            className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
          >
            新建估算
          </Link>
        </div>

        {/* Reframing */}
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold">认知重构</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              26 种视角帮你看清一时不知道怎么办的课题。打破思维定势。
            </p>
          </div>
          <div className="flex-1">
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">还没有重构记录</p>
            ) : (
              <ul className="space-y-2">
                {sessions.slice(0, 3).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/reasoning/reframing/${s.id}`}
                      className="group block rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <p className="text-xs font-medium line-clamp-2 group-hover:underline">
                        {s.topic_text}
                      </p>
                    </Link>
                  </li>
                ))}
                {sessions.length > 3 && (
                  <li className="text-[10px] text-muted-foreground px-2">
                    还有 {sessions.length - 3} 条…
                  </li>
                )}
              </ul>
            )}
          </div>
          <Link
            href="/reasoning/reframing/new"
            className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
          >
            新建重构
          </Link>
        </div>
      </div>
    </div>
  );
}
