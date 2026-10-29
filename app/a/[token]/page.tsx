import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import { supabaseAdmin } from "@/lib/supabase";
import { actionSecret, verifyAction } from "@/lib/action-links";
import { MARK_LABELS, type MarkKind } from "@/lib/domains/signals/memory-shared";
import { pct } from "@/lib/domains/signals/forecast-shared";
import { ANCHOR_LABELS, displayedAnchor } from "@/lib/domains/signals/forecast";
import { listSeconds, loadTodayList, tapsThisWeek } from "@/lib/domains/signals/today-list";
import { ConfirmTap, RecallTap } from "./tap";
import { getDailyReport } from "@/app/(app)/signals/queries";
import { ListenButton } from "@/app/(app)/signals/listen-button";
import { getDigest } from "@/lib/domains/signals/digest";
import { KIND_TITLES } from "@/lib/domains/signals/memory-shared";
import { REPORT_SECTION_KINDS } from "@/lib/domains/signals/feeds";
import { buildListenScript, listenMinutes } from "@/lib/domains/signals/listen-script";
import { listJudgments } from "@/lib/domains/signals/practice";
import { isBlindPracticeDate } from "@/lib/domains/signals/practice-shared";
import { loadReadingPreferences } from "@/lib/domains/signals/reading-preferences";
import { partitionReadingItems } from "@/lib/domains/signals/reading-preferences-shared";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { TodayListView } from "./list-view";

export const dynamic = "force-dynamic";
// 这一页不读登录态（不碰 cookies），只写 dynamic 时 Supabase 的读取还会被 Next 缓存住：
// 一分钟清单点完再打开，点过的还在（2026-10-23 本机试出来的）。明说每次都现取。
export const fetchCache = "force-no-store";
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
        这个链接过期了（单件的七天内有效，一分钟清单和「听」三天）或者不对。
        <Link href="/signals" className="ml-1 text-primary underline-offset-4 hover:underline">
          回网站上做
        </Link>
      </p>
    );
  }

  // 一分钟清单：每次打开都现取（在网站上点过的不再出现）；只读，按钮各自再验口令
  if (p.k === "list") {
    const [list, taps] = await Promise.all([loadTodayList(p.u, p.t), tapsThisWeek(p.u, p.t).catch(() => null)]);
    return shell(<TodayListView token={params.token} day={p.t} items={list.items} more={list.more} seconds={listSeconds(list.items)} taps={taps} />);
  }

  // 听：邮件里点进来，一个大按钮（浏览器不许一打开就出声）；念的和「今天」页的听按钮同一份
  if (p.k === "listen") {
    const view = await sharedViewFor(p.u);
    const [report, digest, preferences, judgments] = await Promise.all([
      getDailyReport(view.sourceUserId, p.t),
      getDigest(view.sourceUserId, p.t).catch(() => null),
      loadReadingPreferences(p.u),
      listJudgments(p.u).catch(() => null),
    ]);
    if (report === "missing-schema") return shell(<p className="text-sm text-muted-foreground">报告还没准备好。</p>);
    const sections = REPORT_SECTION_KINDS.map((kind) => {
      const data = report[kind];
      const { visible, muted } = partitionReadingItems(data?.items ?? [], preferences.preferences);
      return { title: KIND_TITLES[kind], overview: muted.length === 0 ? data?.overview ?? null : null, items: visible.filter((i) => !i.extra) };
    });
    const allItems = REPORT_SECTION_KINDS.flatMap((kind) => report[kind]?.items ?? []);
    const practice = report.news?.practice ?? null;
    const judged = !!practice && !!judgments?.some((j) => j.signal_id === practice.signal_id);
    const script = buildListenScript({
      digest: partitionReadingItems(allItems, preferences.preferences).muted.length === 0 && digest && digest !== "missing-schema" ? digest.summary : null,
      hiddenSignalId: practice && !judged && isBlindPracticeDate(p.t) ? practice.signal_id : null,
      sections,
    });
    const count = sections.reduce((n, s) => n + s.items.length, 0);
    return shell(
      <>
        <p className="text-xs text-muted-foreground">{p.t} 的报告</p>
        <h1 className="mt-1 text-lg font-semibold leading-8">听今天的报告</h1>
        {script.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">这一天的报告还没写好，晚点再来。</p>
        ) : (
          <>
            <p className="mb-6 mt-2 text-sm leading-7 text-muted-foreground">
              约 {listenMinutes(script)} 分钟，{count} 条。浏览器不让网页一打开就出声，点一下开始；锁屏以后有的手机会停。
            </p>
            <ListenButton paragraphs={script} big />
            <ol className="mt-8 space-y-1 text-sm leading-7 text-muted-foreground">
              {sections
                .filter((s) => s.items.length > 0)
                .map((s) => (
                  <li key={s.title}>
                    {s.title} · {s.items.length} 条
                  </li>
                ))}
            </ol>
          </>
        )}
        <Link href="/signals" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
          去网站上看
        </Link>
      </>
    );
  }

  if (p.k === "forecast") {
    // agree：在邮件里点了「行」，同意 AI 的判断（记成哪个数由服务器按 AI 的数算）
    const agree = p.v === "agree";
    const { data: q } = await supabaseAdmin.from("forecast_questions").select("title, criteria, resolve_on, user_id, kind").eq("id", p.t).maybeSingle();
    // 和邮件、预测页上先摆出来的是同一个数（市场价 / 统计基准 / AI）
    const anchor = q ? await displayedAnchor({ id: p.t, kind: q.kind }, q.user_id as string).catch(() => null) : null;
    const said = anchor ? `${ANCHOR_LABELS[anchor.source]}说的 ${pct(anchor.probability)}` : null;
    return shell(
      <>
        <p className="text-xs text-muted-foreground">预测题 · {q?.resolve_on ?? ""} 截止</p>
        <h1 className="mt-1 text-lg font-semibold leading-8">{q?.title ?? "这道题找不到了"}</h1>
        {q?.criteria && <p className="mt-1 text-sm leading-7 text-muted-foreground">怎么才算「会」：{q.criteria}</p>}
        <p className="mb-4 mt-4 text-sm">
          {agree ? `你点了「行」：同意${said ? `${said} 会` : "先摆出来的那个数"}。` : `你的判断：${pct(Number(p.v))}${said ? `（${said}）` : ""}。`}
          记上以后就不能改了。
        </p>
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
