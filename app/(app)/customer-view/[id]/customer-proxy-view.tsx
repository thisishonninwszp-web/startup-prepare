import {
  AlertTriangle,
  Clock3,
  Footprints,
  LockKeyhole,
  MessageSquareQuote,
} from "lucide-react";
import type {
  CustomerEvidenceAtom,
  CustomerProxy,
  CustomerProxyDelta,
} from "../types";

const BASIS_LABEL = {
  stated: "顾客明确表达",
  inferred: "从行为谨慎推断",
  unknown: "目前未知",
} as const;

export function CustomerProxyView({
  proxy,
  delta,
  atoms,
}: {
  proxy: CustomerProxy;
  delta: CustomerProxyDelta | null;
  atoms: CustomerEvidenceAtom[];
}) {
  const evidence = new Map(atoms.map((atom) => [atom.id, atom]));
  const barrierGroups = Object.entries(proxy.switching_barriers) as [
    string,
    string[],
  ][];
  const barrierLabel: Record<string, string> = {
    time: "时间",
    money: "金钱",
    learning: "学习",
    trust: "信任",
    identity: "身份",
    risk: "风险",
  };

  return (
    <div className="space-y-8">
      {proxy.is_provisional && (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-sm text-status-validating">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            临时代理
          </div>
          <p className="mt-2 text-xs leading-5">
            独立保留材料不足3份。这个代理会扩大“不知道”的范围，不能被当作真实顾客结论。
          </p>
        </div>
      )}

      {delta && (
        <section className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-medium">这次理解发生了什么变化</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextList title="新证据支持" items={delta.supported} />
            <TextList title="被推翻" items={delta.overturned} />
            <TextList title="新增未知" items={delta.new_unknowns} />
            <TextList title="处境变化" items={delta.changed_context} />
          </div>
          {delta.reason && (
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              变化原因：{delta.reason}
            </p>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center gap-2">
          <LockKeyhole className="size-4" />
          <h3 className="text-sm font-medium">这是谁</h3>
        </div>
        <p className="mt-3 rounded-lg border bg-card p-5 text-base leading-7">
          {proxy.who}
        </p>
      </section>

      <section>
        <div className="flex items-center gap-2">
          <Clock3 className="size-4" />
          <h3 className="text-sm font-medium">顾客的一天</h3>
        </div>
        <div className="mt-4 border-l pl-5">
          {proxy.day.map((moment, index) => (
            <article key={index} className="relative pb-7 last:pb-0">
              <span className="absolute -left-[1.55rem] top-1 size-2 rounded-full bg-foreground" />
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {moment.time}
              </div>
              <h4 className="mt-1 text-sm font-medium">{moment.scene}</h4>
              <p className="mt-2 text-sm leading-6">{moment.action}</p>
              <blockquote className="mt-3 border-l-2 pl-3 text-sm italic leading-6 text-muted-foreground">
                “{moment.inner_voice}”
              </blockquote>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-muted px-2 py-1 text-[10px]">
                  {moment.emotion || "情绪未知"} ·{" "}
                  {BASIS_LABEL[moment.emotion_basis]}
                </span>
                {moment.tradeoff && (
                  <span className="rounded-full border px-2 py-1 text-[10px]">
                    取舍：{moment.tradeoff}
                  </span>
                )}
              </div>
              <EvidenceRefs ids={moment.evidence_ids} evidence={evidence} />
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2">
            <Footprints className="size-4" />
            <h3 className="text-sm font-medium">现在怎么解决</h3>
          </div>
          <div className="mt-3">
            <SimpleList items={proxy.current_alternatives} />
          </div>
        </section>
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2">
            <Footprints className="size-4" />
            <h3 className="text-sm font-medium">真正想推进什么</h3>
          </div>
          <div className="mt-3">
            <SimpleList items={proxy.desired_progress} />
          </div>
        </section>
      </div>

      <section>
        <h3 className="text-sm font-medium">切换阻力</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {barrierGroups.map(([key, items]) => (
            <div key={key} className="rounded-md border bg-card p-4">
              <div className="text-xs text-muted-foreground">
                {barrierLabel[key]}
              </div>
              <div className="mt-2">
                {items.length ? (
                  <SimpleList items={items} />
                ) : (
                  <span className="text-xs text-muted-foreground">没有证据</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-foreground p-5 text-background">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="size-4" />
          <h3 className="text-sm font-medium">他们自己的词</h3>
        </div>
        <div className="mt-4 space-y-4">
          {proxy.own_words.map((word, index) => (
            <blockquote key={index} className="text-sm leading-6">
              “{word.quote}”
              <span className="ml-2 font-mono text-[9px] opacity-50">
                [{word.evidence_id.slice(0, 8)}]
              </span>
            </blockquote>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium">目前不知道</h3>
        <div className="mt-3 rounded-lg border border-dashed p-5">
          <SimpleList items={proxy.unknowns} />
        </div>
      </section>
    </div>
  );
}

function EvidenceRefs({
  ids,
  evidence,
}: {
  ids: string[];
  evidence: Map<string | undefined, CustomerEvidenceAtom>;
}) {
  if (ids.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[10px] text-muted-foreground">
        查看 {ids.length} 条证据
      </summary>
      <div className="mt-2 space-y-2">
        {ids.map((id) => (
          <p key={id} className="rounded bg-muted p-2 text-xs leading-5">
            {evidence.get(id)?.quote ?? `证据 ${id.slice(0, 8)}`}
          </p>
        ))}
      </div>
    </details>
  );
}

function SimpleList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="text-sm leading-6">
          · {item}
        </li>
      ))}
    </ul>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1">
        {items.length ? (
          <SimpleList items={items} />
        ) : (
          <span className="text-xs text-muted-foreground">没有明确变化</span>
        )}
      </div>
    </div>
  );
}
