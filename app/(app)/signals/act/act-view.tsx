import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarList } from "@/components/ui/bar-list";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { actFunnel, movedGaps, nextSteps, type ActGap, type ActState } from "@/lib/domains/signals/act-shared";

const SIDE_LABEL: Record<ActGap["side"], string> = { japan: "中国 → 日本", us: "美国 → 日本", china: "日本 → 中国" };

/** 一条差距走到哪几格（只列走到了的）。 */
function Progress({ g }: { g: ActGap }) {
  const parts = [
    g.quotes !== null ? `原话 ${g.quotes} 句` : null,
    g.door ? `假门${g.door.open ? "" : "（关着）"} 看了 ${g.door.views} · 留邮箱 ${g.door.signups} · 联系过 ${g.door.contacted}` : null,
    g.idea ? `想法 · 验证 ${g.idea.validations} 次` : null,
  ].filter(Boolean);
  return <span className="font-mono text-xs text-muted-foreground">{parts.join(" ｜ ")}</span>;
}

/** 本周行动这一页的样子（数据由页面取好传进来）。 */
export function ActView({ state }: { state: ActState }) {
  const [first, ...rest] = nextSteps(state);
  const funnel = actFunnel(state.gaps);
  const moved = movedGaps(state.gaps);

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="This week"
        title="本周行动"
        description="外部信号读了很多，这一页只问一件事：这周往前推哪一格。由代码按你现在走到哪一步排，只给一件最该做的 —— 一次给五件，人会先挑最容易的那件。"
      />

      <section className="rounded-lg border border-primary/40 bg-card p-5">
        <p className="font-mono text-xs text-primary">这周最该做的一件事</p>
        <p className="mt-2 text-lg font-semibold leading-8">{first.text}</p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{first.why}</p>
        <Button asChild className="mt-4">
          <Link href={first.href}>{first.cta} →</Link>
        </Button>
      </section>

      {rest.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">做完那件，再看这几件</h2>
          <ul className="mt-3 space-y-3">
            {rest.slice(0, 4).map((s) => (
              <li key={s.key} className="text-sm leading-7">
                <Link href={s.href} className="text-primary underline-offset-4 hover:underline">
                  {s.text}
                </Link>
                <p className="text-xs leading-6 text-muted-foreground">{s.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 border-t pt-6">
        <h2 className="text-base font-semibold">一条差距往前走的几格</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          每一格有几条走到了，只数次数。越往右越接近真实接触 —— 到「记过验证」才进了想法的 Go / Kill。
        </p>
        <div className="mt-3">
          <BarList title="走到每一格的有几条" items={funnel.map((f) => ({ label: f.label, value: f.count }))} unit=" 条" />
        </div>
      </section>

      <section className="mt-10 border-t pt-6">
        <h2 className="text-base font-semibold">动过的几条</h2>
        {moved.length === 0 ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            这里空着：清单里还没有一条听过原话、开过假门或变成想法。从上面那件事开始。
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {moved.map((g) => (
              <li key={`${g.side}:${g.signal_id}`} className="border-b border-border pb-3 last:border-b-0">
                <p className="text-sm font-medium leading-7">{g.headline}</p>
                <p className="text-xs text-muted-foreground">{SIDE_LABEL[g.side]}</p>
                <Progress g={g} />
                <p className="mt-1 flex flex-wrap gap-x-4 text-xs">
                  <Link href={`/signals/gaps/door?side=${g.side}&signal=${g.signal_id}`} className="text-primary underline-offset-4 hover:underline">
                    {g.door ? "假门页" : "开一个假门"}
                  </Link>
                  {g.idea && (
                    <Link href={`/ideas/${g.idea.id}`} className="text-primary underline-offset-4 hover:underline">
                      想法页
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        {state.gaps.length > moved.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            清单里还有 {state.gaps.length - moved.length} 条一格都没动过。{" "}
            <Link href="/signals/gaps" className="text-primary underline-offset-4 hover:underline">
              去差距清单 →
            </Link>
          </p>
        )}
      </section>
    </PageContainer>
  );
}
