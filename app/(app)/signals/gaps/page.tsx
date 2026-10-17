import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatReportDate } from "@/lib/domains/signals/format";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { todayGapScan } from "@/lib/domains/signals/gap-scan";
import { listGapBoard, type JapanGapRow } from "@/lib/domains/signals/gaps";
import { RECHECKS_PER_DAY, transferKey, type ArrivedGap, type GapSide, type GapTransfer } from "@/lib/domains/signals/gaps-shared";
import { loadGapTransfers } from "@/lib/domains/signals/gap-transfer";
import { loadGapVoices, type GapVoices } from "@/lib/domains/signals/voices";
import { loadFakeDoorStats, type FakeDoorStats } from "@/lib/domains/signals/fake-door";
import { gapDemand, listIssues, type GapDemand } from "@/lib/domains/signals/issue";
import { SourceCheckView } from "../check-view";
import { GapActions } from "./gap-actions";
import { GapScanLoader } from "./gap-scan-loader";
import { TransferView } from "./transfer-view";
import { VoicesView } from "./voices-view";

export const dynamic = "force-dynamic";
// 第一次打开时要扫一轮、重查几条（各三四十秒），由这一页的 server action 跑
export const maxDuration = 60;

/** 两个方向的叫法：问的是哪边有没有、原文在哪边、有人拿到钱时说的是哪边。 */
const SIDE_TEXT: Record<GapSide, { here: string; there: string; empty: string }> = {
  japan: {
    here: "日本",
    there: "中国",
    empty: "只有查到出处、确认日本还没有或没普及的才会进来，所以攒得慢。过几天再来看。",
  },
  china: {
    here: "中国",
    there: "日本",
    empty: "报告里日本的产品、服务或做法，查下来中国还没有或没普及的，会攒在这里。过几天再来看。",
  },
  us: {
    here: "日本",
    there: "美国",
    empty: "Hacker News、TechCrunch 上的产品和做法，查到出处、确认日本还没有或没普及的才会进来。过几天再来看。",
  },
};

function GapList({
  gaps,
  side,
  transfers,
  demand,
  voices,
  doors,
}: {
  gaps: JapanGapRow[];
  side: GapSide;
  transfers: Map<string, GapTransfer>;
  /** 周刊上这一条收到的回应（只数次数）。 */
  demand: Map<string, GapDemand>;
  /** 这边有没有人在为这件事头疼（查过的）。 */
  voices: Map<string, GapVoices>;
  /** 假门测试：看了几次、留了几个邮箱。 */
  doors: Map<string, FakeDoorStats>;
}) {
  const t = SIDE_TEXT[side];
  if (gaps.length === 0) return <EmptyState title="这里空着。" description={t.empty} />;
  return (
    <>
      <p className="mb-4 font-mono text-xs text-muted-foreground">{gaps.length} 条</p>
      <ul className="space-y-4">
        {gaps.map((g) => (
          <li key={g.signal_id} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              {formatReportDate(g.brief_date)} · {g.source}
            </p>
            <h3 className="mt-1 text-base font-semibold leading-7">{g.headline}</h3>
            <p className="mt-2 text-sm leading-7">
              <span className="text-muted-foreground">{t.here}这边：</span>
              {g.japan}
            </p>
            {g.funded && (
              <div className="mt-2 text-sm leading-7">
                <p>
                  <span className="text-muted-foreground">{t.here}已经有人拿到钱在做：</span>
                  {g.funded.company}
                  <span className="ml-1 text-xs text-muted-foreground">（方向被验证过，也说明有人先走了一步）</span>
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">原文</summary>
                  <p className="mt-1 text-muted-foreground">
                    「{g.funded.excerpt}」
                    <a
                      href={g.funded.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary underline-offset-4 hover:underline"
                    >
                      来源 ↗
                    </a>
                  </p>
                </details>
              </div>
            )}
            {g.whyNow && (
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">为什么是现在：</span>
                {g.whyNow}
              </p>
            )}
            <div className="mt-1">
              <SourceCheckView
                check={g.check}
                searchQuery={`${t.here} ${g.headline}`}
                unverifiedText="没查到出处，这句是 AI 凭印象说的。"
                uncheckedText="这句是 AI 凭印象说的，没上网查过。"
              />
            </div>
            {(() => {
              const d = demand.get(transferKey(side, g.signal_id));
              return d ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  周刊上：说想要 {d.pain} · 问哪里买 {d.pay} · 想聊 {d.wantsTalk}
                </p>
              ) : null;
            })()}
            <TransferView
              signalId={g.signal_id}
              side={side}
              here={t.here}
              there={t.there}
              initial={transfers.get(transferKey(side, g.signal_id)) ?? null}
            />
            <VoicesView signalId={g.signal_id} side={side} here={t.here} initial={voices.get(transferKey(side, g.signal_id)) ?? null} />
            {(() => {
              const door = doors.get(transferKey(side, g.signal_id));
              return (
                <p className="mt-1 text-sm">
                  <Link
                    href={`/signals/gaps/door?side=${side}&signal=${g.signal_id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {door
                      ? `假门测试${door.open ? "" : "（关着）"}：看了 ${door.views} 次 · 留了邮箱 ${door.signups} 人 →`
                      : `做个假门测试：${t.here}的陌生人看到价格，愿不愿意留邮箱 →`}
                  </Link>
                </p>
              );
            })()}
            {g.recheck && (
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                {formatReportDate(g.recheck.on)}又查了一次：
                {g.recheck.verdict === "still" ? `${t.here}这边还是没有。` : "没查清（没找到出处），过一个月再查。"}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <GapActions signalId={g.signal_id} observed={g.observed} side={side} />
              {g.url && (
                <a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  {t.there}那边的原文 ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 进清单时查过是没有，一个月后再查已经有了的那几条。 */
function ArrivedList({ gaps, side }: { gaps: ArrivedGap[]; side: GapSide }) {
  if (gaps.length === 0) return null;
  const t = SIDE_TEXT[side];
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold">这几条，{t.here}这边有了</h3>
      <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">
        进清单那天查过是没有。过了一个月再查，已经有人在做了 —— 要么说明当初看对了方向，要么说明有人先走了一步。去看看是谁、做成了什么样。
      </p>
      <ul className="space-y-4">
        {gaps.map((g) => (
          <li key={g.signal_id} className="rounded-lg border border-border bg-card p-4">
            <h4 className="text-base font-semibold leading-7">{g.headline}</h4>
            <p className="mt-2 text-sm leading-7">
              <span className="text-muted-foreground">当初（{formatReportDate(g.brief_date)}）：</span>
              {g.japan}
            </p>
            <p className="mt-1 text-sm leading-7">
              <span className="text-muted-foreground">现在（{formatReportDate(g.arrivedOn)}）：</span>
              {g.now}
            </p>
            {g.nowFunded && (
              <p className="mt-1 text-sm leading-7">
                <span className="text-muted-foreground">有人拿到钱在做：</span>
                {g.nowFunded.company}
                <a
                  href={g.nowFunded.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-xs text-primary underline-offset-4 hover:underline"
                >
                  来源 ↗
                </a>
              </p>
            )}
            <div className="mt-1">
              <SourceCheckView
                check={g.nowCheck ?? undefined}
                searchQuery={`${t.here} ${g.headline}`}
                unverifiedText="没查到出处。"
                uncheckedText="没上网查过。"
              />
            </div>
            {g.url && (
              <a
                href={g.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
              >
                {t.there}那边的原文 ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 页面顶上：今天扫了没有、该不该重查。迁移没跑就说清楚差哪一步。 */
function ScanStatus({
  ready,
  scanned,
  dueCount,
  recheckedToday,
}: {
  ready: boolean;
  scanned: { picked: number; gaps: number } | null;
  dueCount: number;
  recheckedToday: boolean;
}) {
  if (!ready) {
    return (
      <p className="mb-8 text-sm leading-7 text-muted-foreground">
        每天专门扫一轮、满一个月重查，这两件还差一步：迁移 063 没跑。执行 supabase/migrations/063_signal_gap_scan.sql 之后，打开这一页就会开始。
        在那之前，清单照旧只从每天报告里攒。
      </p>
    );
  }
  const recheck = recheckedToday ? 0 : dueCount;
  if (!scanned || recheck > 0) return <GapScanLoader scan={!scanned} dueCount={recheck} batch={RECHECKS_PER_DAY} />;
  return (
    <p className="mb-8 font-mono text-xs text-muted-foreground">
      {scanned.picked === 0
        ? "今天专门扫了一轮，没有讲产品、服务的新东西。"
        : `今天专门扫了一轮：挑出 ${scanned.picked} 条讲产品、服务的，${scanned.gaps} 条查下来日本还没有或没普及，进了清单。`}
    </p>
  );
}

export default async function JapanGapsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [board, scanned, transfers, issues, voices, doors] = await Promise.all([
    listGapBoard(user.id, tokyoToday()),
    todayGapScan(user.id),
    loadGapTransfers(user.id),
    listIssues(user.id),
    loadGapVoices(user.id),
    loadFakeDoorStats(user.id),
  ]);
  const demand = gapDemand(issues);
  const { japan: toJapan, us: fromUs, china: toChina } = board.sides;

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="Gaps"
        title="那边有、这边还没有"
        description="每天报告里中国和美国的那几条，加上每天专门从中文、美国消息里挑出来讲产品和服务的几条，上网查下来日本还没有、或者有但没普及的，都攒在这里；反过来，日本有、中国还没有的也攒着。进清单满一个月会再查一次，有了就挪出来单列。哪条让你想多琢磨一下，就记成观察，或者直接变成一个想法。"
      />

      <ScanStatus ready={board.ready} scanned={scanned} dueCount={board.dueCount} recheckedToday={board.recheckedToday} />
      <p className="-mt-4 mb-8 text-sm">
        <Link href="/signals/issue" className="text-primary underline-offset-4 hover:underline">
          挑几条、写上你的判断，整理成这周的周刊发出去 →
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/signals/atlas" className="text-primary underline-offset-4 hover:underline">
          时差图谱：这类东西以前多久到日本 →
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/signals/kanpo" className="text-primary underline-offset-4 hover:underline">
          在日本的中国公司：官报上的决算 →
        </Link>
      </p>

      <h2 className="mb-4 text-xl font-semibold">中国有、日本还没有</h2>
      <ArrivedList gaps={toJapan.arrived} side="japan" />
      <GapList gaps={toJapan.open} side="japan" transfers={transfers} demand={demand} voices={voices} doors={doors} />

      <section className="mt-12 border-t pt-6">
        <h2 className="text-xl font-semibold">美国有、日本还没有</h2>
        <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">
          美国先出现的产品和做法，日本常常晚几年。只收讲产品、服务、生意做法的，纯技术讨论不收。
        </p>
        <ArrivedList gaps={fromUs.arrived} side="us" />
        <GapList gaps={fromUs.open} side="us" transfers={transfers} demand={demand} voices={voices} doors={doors} />
      </section>

      <section className="mt-12 border-t pt-6">
        <h2 className="text-xl font-semibold">反过来：日本有、中国还没有</h2>
        <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">
          日本做成、中国还没有的东西，可能适合跨境电商卖给中国人，或者把这种做法带去中国。
        </p>
        <ArrivedList gaps={toChina.arrived} side="china" />
        <GapList gaps={toChina.open} side="china" transfers={transfers} demand={demand} voices={voices} doors={doors} />
      </section>
    </PageContainer>
  );
}
