import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import { supabaseAdmin } from "@/lib/supabase";
import { actionSecret, verifyAction } from "@/lib/action-links";
import { MARK_LABELS, type MarkKind } from "@/lib/domains/signals/memory-shared";
import { pct } from "@/lib/domains/signals/forecast-shared";
import { ConfirmTap, RecallTap } from "./tap";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "IdeaOS", robots: { index: false, follow: false } };

/**
 * 邮件里「点一下就完成」的落地页（不用登录，口令验过才算）：说清要记什么，按了按钮才记 ——
 * 邮箱的安全扫描会先打开链接，不能一打开就记上。
 */
export default async function TapPage({ params }: { params: { token: string } }) {
  const secret = actionSecret();
  const p = secret ? verifyAction(params.token, secret) : null;
  const shell = (body: React.ReactNode) => (
    <PageContainer width="narrow">
      <div className="py-12">{body}</div>
    </PageContainer>
  );
  if (!p) {
    return shell(
      <p className="text-sm leading-7 text-muted-foreground">
        这个链接过期了（七天内有效）或者不对。
        <Link href="/signals" className="ml-1 text-primary underline-offset-4 hover:underline">
          回网站上做
        </Link>
      </p>
    );
  }

  if (p.k === "forecast") {
    // agree：在邮件里点了「行」，同意 AI 的判断（记成哪个数由服务器按 AI 的数算）
    const agree = p.v === "agree";
    const { data: q } = await supabaseAdmin.from("forecast_questions").select("title, criteria, resolve_on").eq("id", p.t).maybeSingle();
    return shell(
      <>
        <p className="text-xs text-muted-foreground">预测题 · {q?.resolve_on ?? ""} 截止</p>
        <h1 className="mt-1 text-lg font-semibold leading-8">{q?.title ?? "这道题找不到了"}</h1>
        {q?.criteria && <p className="mt-1 text-sm leading-7 text-muted-foreground">怎么才算「会」：{q.criteria}</p>}
        <p className="mb-4 mt-4 text-sm">{agree ? "你点了「行」：同意 AI 的判断。" : `你的判断：${pct(Number(p.v))}。`}记上以后就不能改了。</p>
        <ConfirmTap token={params.token} label={agree ? "同意，记上" : `就是 ${pct(Number(p.v))}，记上`} />
      </>
    );
  }

  const { data: signal } = await supabaseAdmin.from("external_signals").select("title, fetched_at").eq("id", p.t).maybeSingle();
  const title = (signal?.title as string | undefined) ?? "这一条找不到了";

  if (p.k === "mark") {
    return shell(
      <>
        <p className="text-xs text-muted-foreground">{(signal?.fetched_at as string | undefined)?.slice(0, 10) ?? ""}</p>
        <h1 className="mt-1 text-lg font-semibold leading-8">{title}</h1>
        <p className="mb-4 mt-2 text-sm">把这一条标成「{MARK_LABELS[p.v as MarkKind] ?? p.v}」。</p>
        <ConfirmTap token={params.token} label="标上" />
      </>
    );
  }

  return shell(
    <>
      <p className="text-xs text-muted-foreground">回想 · {(signal?.fetched_at as string | undefined)?.slice(0, 10) ?? ""}</p>
      <h1 className="mt-1 text-lg font-semibold leading-8">{title}</h1>
      <p className="mb-4 mt-2 text-sm leading-7 text-muted-foreground">先别急着看：当时你为什么在意它？你觉得后来怎样了？在心里说一遍。</p>
      <RecallTap token={params.token} />
    </>
  );
}
