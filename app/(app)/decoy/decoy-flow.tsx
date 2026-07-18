"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Textarea } from "@/components/ui/textarea";
import {
  expandFinalPlan,
  retryCritique,
  retryReveal,
  reviseOwnPlan,
  saveDecoyLearned,
  submitChallenges,
  submitOwnPlan,
} from "./actions";
import {
  decoyFlawLabel,
  type DecoyPlanPublic,
  type DecoyPlantedFlaw,
  type DecoyReveal,
  type DecoySessionStatus,
  type OwnPlanCritique,
} from "./types";

export type DecoySessionForClient = {
  id: string;
  problem: string;
  plan: DecoyPlanPublic;
  planted_flaws: DecoyPlantedFlaw[] | null; // 揭底前服务端置 null
  challenges: string | null;
  reveal: DecoyReveal | null;
  own_plan: string | null;
  own_plan_critique: OwnPlanCritique | null;
  final_plan: string | null;
  learned: string | null;
  status: DecoySessionStatus;
};

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败，请重试");
      }
    });
  };
  return { error, pending, run };
}

function FlawTag({ type }: { type: DecoyPlantedFlaw["type"] }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
      {decoyFlawLabel(type)}
    </span>
  );
}

function PlanBody({ plan }: { plan: DecoyPlanPublic }) {
  return (
    <div className="space-y-5">
      {plan.sections.map((s) => (
        <section key={s.heading}>
          <h3 className="text-sm font-medium">{s.heading}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{s.content}</p>
        </section>
      ))}
    </div>
  );
}

export function DecoyFlow({ session }: { session: DecoySessionForClient }) {
  const { error, pending, run } = useAction();
  const [challenges, setChallenges] = useState(session.challenges ?? "");
  const [ownPlan, setOwnPlan] = useState(session.own_plan ?? "");
  const [learned, setLearned] = useState(session.learned ?? "");
  const [revising, setRevising] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">问题：{session.problem}</p>
        <Link href="/decoy" className="shrink-0 text-xs text-muted-foreground hover:underline">
          ← 新的练习
        </Link>
      </div>

      {/* 阶段 1-2：假方案 + 质疑 */}
      <section className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">一份方案</h2>
          {session.reveal ? (
            <span className="text-xs text-muted-foreground">已揭底：它是故意埋了雷的</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              这份方案有问题。别急着信它。
            </span>
          )}
        </div>
        <PlanBody plan={session.plan} />
      </section>

      {session.status === "drafted" && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium">你的质疑</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            这份方案里哪些话看起来对、其实站不住？不告诉你有几处。写完提交才能看答案。
          </p>
          <Textarea
            className="mt-3"
            rows={6}
            value={challenges}
            onChange={(e) => setChallenges(e.target.value)}
            placeholder="逐条写。指出具体哪句话有问题、为什么。"
            disabled={pending}
          />
          <div className="mt-3 flex justify-end">
            <ConfirmButton
              confirmLabel="揭底后不能再补充质疑，再点一次确认"
              disabled={pending || !challenges.trim()}
              onClick={() => run(() => submitChallenges({ sessionId: session.id, challenges }))}
            >
              {pending ? "对照中…" : "提交质疑，揭底"}
            </ConfirmButton>
          </div>
        </section>
      )}

      {session.status === "challenged" && (
        <section className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">质疑已保存，但揭底没有完成。</p>
          <div className="mt-3 flex justify-end">
            <Button disabled={pending} onClick={() => run(() => retryReveal({ sessionId: session.id }))}>
              {pending ? "对照中…" : "重试揭底"}
            </Button>
          </div>
        </section>
      )}

      {/* 阶段 3：揭底 */}
      {session.reveal && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium">揭底</h2>
          {session.challenges && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                你当时的质疑
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {session.challenges}
              </p>
            </details>
          )}

          <div className="mt-4 space-y-5">
            {session.reveal.caught.length > 0 && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  抓到的（{session.reveal.caught.length}）
                </h3>
                <ul className="mt-2 space-y-3">
                  {session.reveal.caught.map((c, i) => (
                    <li key={i} className="rounded-md border border-status-mvp/30 bg-status-mvp/10 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p>“{c.quote}”</p>
                        <FlawTag type={c.type} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">你的质疑：{c.matched_challenge}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.reveal.missed.length > 0 && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  漏掉的（{session.reveal.missed.length}）
                </h3>
                <ul className="mt-2 space-y-3">
                  {session.reveal.missed.map((m, i) => (
                    <li key={i} className="rounded-md border border-status-validating/30 bg-status-validating/10 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p>“{m.quote}”</p>
                        <FlawTag type={m.type} />
                      </div>
                      <p className="mt-2 text-xs"><span className="text-muted-foreground">为什么看起来对：</span>{m.why_plausible}</p>
                      <p className="mt-1 text-xs"><span className="text-muted-foreground">实际为什么错：</span>{m.why_wrong}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.reveal.bonus.length > 0 && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  额外发现——AI 没埋、你自己看出来的
                </h3>
                <ul className="mt-2 space-y-3">
                  {session.reveal.bonus.map((b, i) => (
                    <li key={i} className="rounded-md border p-3 text-sm">
                      <p>{b.point}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{b.comment}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 阶段 4：写自己的方案 */}
      {session.status === "revealed" && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium">现在，写你自己的方案</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            这才是这次练习的产物。刚拆完别人的雷，趁着警觉写：你的方案避开这些坑了吗？
          </p>
          <Textarea
            className="mt-3"
            rows={8}
            value={ownPlan}
            onChange={(e) => setOwnPlan(e.target.value)}
            placeholder="你打算怎么解决这个问题？"
            disabled={pending}
          />
          <div className="mt-3 flex justify-end">
            <Button
              disabled={pending || !ownPlan.trim()}
              onClick={() => run(() => submitOwnPlan({ sessionId: session.id, ownPlan }))}
            >
              {pending ? "AI 正在质疑你的方案…" : "提交，让 AI 质疑它"}
            </Button>
          </div>
        </section>
      )}

      {session.status === "drafting_own" && (
        <section className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">方案已保存，但 AI 质疑没有完成。</p>
          <div className="mt-3 flex justify-end">
            <Button disabled={pending} onClick={() => run(() => retryCritique({ sessionId: session.id }))}>
              {pending ? "质疑中…" : "重试质疑"}
            </Button>
          </div>
        </section>
      )}

      {/* 阶段 5：自己的方案 + AI 质疑 + 定稿 */}
      {session.status === "concluded" && session.own_plan && (
        <>
          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">你的方案</h2>
              {!revising && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevising(true)}
                >
                  修订
                </Button>
              )}
            </div>
            {revising ? (
              <>
                <Textarea
                  className="mt-3"
                  rows={8}
                  value={ownPlan}
                  onChange={(e) => setOwnPlan(e.target.value)}
                  disabled={pending}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" disabled={pending} onClick={() => setRevising(false)}>
                    取消
                  </Button>
                  <Button
                    disabled={pending || !ownPlan.trim()}
                    onClick={() =>
                      run(async () => {
                        await reviseOwnPlan({ sessionId: session.id, ownPlan });
                        setRevising(false);
                      })
                    }
                  >
                    保存修订
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{session.own_plan}</p>
            )}
          </section>

          {session.own_plan_critique && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="text-sm font-medium">AI 对你方案的质疑</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                一次性输出，不是对话。它在找你方案会死的理由——值不值得改，你自己判断。
              </p>
              {session.own_plan_critique.suspected_flaws.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {session.own_plan_critique.suspected_flaws.map((f, i) => (
                    <li key={i} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p>“{f.quote}”</p>
                        <FlawTag type={f.type} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{f.comment}</p>
                    </li>
                  ))}
                </ul>
              )}
              {session.own_plan_critique.open_questions.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    还没回答的问题
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {session.own_plan_critique.open_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">扩写定稿</h2>
              <span className="text-xs text-muted-foreground">
                AI 只重组和补细节，判断还是你的
              </span>
            </div>
            {session.final_plan ? (
              <>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{session.final_plan}</p>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => expandFinalPlan({ sessionId: session.id }))}
                  >
                    {pending ? "重新扩写中…" : "重新扩写（覆盖）"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => expandFinalPlan({ sessionId: session.id }))}
                >
                  {pending ? "扩写中…" : "扩写成完整方案"}
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      {/* 学到了：揭底后任何阶段可存 */}
      {(session.status === "revealed" ||
        session.status === "drafting_own" ||
        session.status === "concluded") && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium">把这次的盲点存为&ldquo;学到了&rdquo;</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            用你自己的话写一句。AI 不代写。
          </p>
          <Textarea
            className="mt-3"
            rows={2}
            value={learned}
            onChange={(e) => setLearned(e.target.value)}
            placeholder="例如：我又一次把一个精确的数字当成了证据"
            disabled={pending}
          />
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              disabled={pending || !learned.trim() || learned.trim() === (session.learned ?? "")}
              onClick={() => run(() => saveDecoyLearned({ sessionId: session.id, learned }))}
            >
              {session.learned ? "更新" : "存入学到了"}
            </Button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
