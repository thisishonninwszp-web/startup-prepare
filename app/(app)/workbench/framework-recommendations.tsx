import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FrameworkRecommendation } from "./domain";

const LANE_LABELS: Record<FrameworkRecommendation["lane"], string> = {
  see_reality: "看清现实",
  test_judgment: "校验判断",
  close_action: "收束行动",
};

export function FrameworkRecommendations({
  cards,
}: {
  cards: FrameworkRecommendation[];
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Framework router
        </p>
        <h2 className="mt-1 text-lg font-medium">换个框架看</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          不是工具大全。这里每次只给三个方向：先看清、再校验、最后收束。
        </p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <article key={card.lane} className="rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                {LANE_LABELS[card.lane]}
              </span>
            </div>
            <h3 className="mt-3 text-sm font-medium">{card.title}</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {card.reason}
            </p>
            <dl className="mt-3 space-y-2 text-xs leading-5">
              <div>
                <dt className="text-foreground">看清什么</dt>
                <dd className="text-muted-foreground">{card.opens}</dd>
              </div>
              <div>
                <dt className="text-foreground">看不清什么</dt>
                <dd className="text-muted-foreground">{card.blind_spot}</dd>
              </div>
              <div>
                <dt className="text-foreground">产出</dt>
                <dd className="text-muted-foreground">{card.output}</dd>
              </div>
            </dl>
            <Link
              href={card.href}
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
            >
              进入这个框架
              <ArrowRight className="size-3" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
