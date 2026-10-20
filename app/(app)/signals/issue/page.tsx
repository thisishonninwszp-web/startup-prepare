import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { getIssue, issueCandidates, issueCounts, listIssues, loadIssueMetrics, weekStartOf } from "@/lib/domains/signals/issue";
import { IssueMetrics } from "./issue-metrics";
import { getPublicToken } from "@/lib/domains/signals/public-record";
import { loadIssueDoors, loadOpenDoorLinks } from "@/lib/domains/signals/fake-door";
import { ATLAS_CATEGORIES, categoryBase, countedCases, listTransferCases, type AtlasCategory, type CategoryBase } from "@/lib/domains/signals/atlas";
import { loadGapDeep } from "@/lib/domains/signals/deep";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { latestGapImage, type GapImage } from "@/lib/domains/signals/images";
import { IssueComposer } from "./issue-composer";

export const dynamic = "force-dynamic";
// 生成四个版本要二三十秒，由这一页的 server action 跑
export const maxDuration = 60;

export default async function IssuePage({ searchParams }: { searchParams: { pick?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const weekStart = weekStartOf(tokyoToday());
  // 从一条讲透点「用这一条写一期」过来：预选那一条，带上在那一页点的判断和类别
  const [pickSide, pickId] = (searchParams.pick ?? "").split(":");
  const include =
    (["japan", "us", "china"] as GapSide[]).includes(pickSide as GapSide) && /^[0-9a-f-]{36}$/i.test(pickId ?? "")
      ? { side: pickSide as GapSide, signal_id: pickId }
      : null;
  const [current, candidates, past, publicToken, cases, doors, issueDoors, pickedDeep, metrics] = await Promise.all([
    getIssue(user.id, weekStart),
    issueCandidates(user.id, include ? [include] : []),
    listIssues(user.id),
    getPublicToken(user.id),
    listTransferCases(user.id).catch(() => "missing-schema" as const),
    loadOpenDoorLinks(user.id),
    loadIssueDoors(user.id),
    include ? loadGapDeep(user.id, include.side, include.signal_id).catch(() => null) : Promise.resolve(null),
    loadIssueMetrics(user.id).catch(() => new Map()),
  ]);
  const deepRow = pickedDeep && pickedDeep !== "missing-schema" ? pickedDeep : null;
  // 挑条时每条已经出过的示意图（没出过、迁移没跑的不放）
  const images: Record<string, GapImage> = {};
  await Promise.all(
    candidates.gaps.map(async (g) => {
      const image = await latestGapImage(user.id, g.side, g.signal_id).catch(() => null);
      if (image && image !== "missing-schema") images[`${g.side}:${g.signal_id}`] = image;
    })
  );
  // 时差图谱里每一类的基准：点"这属于哪一类"就显示同一类的先例
  const atlasBases =
    cases === "missing-schema" || cases.length === 0
      ? null
      : (Object.fromEntries(
          (Object.keys(ATLAS_CATEGORIES) as AtlasCategory[]).map((k) => [k, categoryBase(countedCases(cases).filter((c) => c.category === k))])
        ) as Record<AtlasCategory, CategoryBase>);
  const earlier = past.filter((p) => p.week_start !== weekStart);

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Weekly"
        title="周刊"
        description="朋友圈小，就写出来让陌生人找上门。每周一期「那边有、这边还没有」：挑几条核实过的，每条写一句你自己的判断，再公开对账押过的。系统排成小红书、日文 note、中文长文三个版本，你复制去发。前两三个月多半没人来，靠的是每周不断。"
      />

      {current === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 071 没跑。执行 supabase/migrations/071_signal_issues.sql 之后再来。
        </p>
      ) : (
        <>
          <p className="mb-6 font-mono text-xs text-muted-foreground">这一期：{weekStart} 这一周</p>
          <IssueComposer
            gaps={candidates.gaps}
            bets={candidates.bets}
            initial={current}
            publicToken={publicToken}
            atlasBases={atlasBases}
            doors={doors}
            issueDoors={{ zh: issueDoors.zh?.open ? issueDoors.zh.token : null, ja: issueDoors.ja?.open ? issueDoors.ja.token : null }}
            preselect={
              include
                ? {
                    ...include,
                    stance: deepRow?.stance?.stance ?? {},
                    note: deepRow?.stance?.note ?? "",
                    category: deepRow?.category ?? undefined,
                  }
                : null
            }
            images={images}
          />
          {current && current.published.length > 0 && current.content.picks.length > 0 && (
            <IssueMetrics
              issueId={current.id}
              picks={current.content.picks.map((p) => ({ headline: p.headline }))}
              initial={metrics.get(current.id) ?? []}
            />
          )}
          <section className="mt-12 border-t pt-6">
            <h2 className="text-base font-semibold">这份周刊能不能卖</h2>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">
              给周刊的付费版做一页「准备中」，看陌生人看着价格还愿不愿意留邮箱。开着的话，链接会自动放进中文长文和 note 版的文末。
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {(["zh", "ja"] as const).map((l) => {
                const d = issueDoors[l];
                return (
                  <li key={l}>
                    <Link href={`/signals/issue/door?lang=${l}`} className="text-primary underline-offset-4 hover:underline">
                      {l === "zh" ? "中文页（给想做日本市场的中国公司、做跨境的人）" : "日文页（给日本公司做新规事业的人）"}
                      {d ? `：${d.open ? "" : "关着 · "}看了 ${d.views} 次 · 留了邮箱 ${d.signups} 人 →` : "：还没做 →"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {earlier.length > 0 && (
        <section className="mt-12 border-t pt-6">
          <h2 className="text-base font-semibold">以前的 {earlier.length} 期</h2>
          <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
            {earlier.map((p) => {
              const c = issueCounts(p);
              return (
                <li key={p.id}>
                  {p.week_start} · 写了 {p.content.picks.length} 条 · 发了 {c.published} 处 · 回应 {c.responses} 条 · 想聊 {c.wantsTalk} 位
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
