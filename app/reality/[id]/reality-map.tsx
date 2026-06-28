import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CircleHelp,
  Gauge,
  HeartPulse,
  Lightbulb,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import type { RealityDelta, RealityMap, RealityPath } from "../types";

const PATH_LABEL = {
  investigate: "补充信息",
  act: "立即行动",
  wait: "暂不行动",
} as const;

export function RealityMapView({
  map,
  delta,
  selectedPath,
  customAction,
  selectionReason,
  reviewDueAt,
  onSelectPath,
}: {
  map: RealityMap;
  delta: RealityDelta | null;
  selectedPath?: RealityPath | null;
  customAction?: string | null;
  selectionReason?: string | null;
  reviewDueAt?: string | null;
  onSelectPath?: (index: number) => void;
}) {
  return (
    <div className="space-y-8">
      {delta && <DeltaBlock delta={delta} />}

      <MapSection icon={Gauge} number="01" title="当前课题">
        <p className="text-lg font-medium tracking-tight">{map.topic}</p>
      </MapSection>

      <MapSection icon={HeartPulse} number="02" title="情绪、触发与判断影响">
        <div className="grid gap-3 md:grid-cols-2">
          {map.emotions.map((emotion, index) => (
            <div key={index} className="rounded-md border bg-card p-4">
              <div className="text-sm font-medium">{emotion.feeling}</div>
              <dl className="mt-3 space-y-2 text-xs leading-5">
                <div>
                  <dt className="text-muted-foreground">触发</dt>
                  <dd>{emotion.trigger}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">对判断的影响</dt>
                  <dd>{emotion.judgment_impact}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </MapSection>

      <MapSection icon={LockKeyhole} number="03" title="已确认事实">
        <div className="divide-y rounded-md border bg-card">
          {map.facts.map((fact, index) => (
            <div key={index} className="p-4">
              <p className="text-sm">{fact.statement}</p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                来源 · {fact.source}
              </p>
            </div>
          ))}
        </div>
      </MapSection>

      <div className="grid gap-8 lg:grid-cols-2">
        <MapSection icon={Brain} number="04" title="你的解释与假设">
          <TextList items={map.interpretations} />
        </MapSection>
        <MapSection icon={CircleHelp} number="05" title="未知与信息缺口">
          <TextList items={map.unknowns} />
        </MapSection>
      </div>

      <MapSection icon={Gauge} number="06" title="约束与可控项">
        <div className="grid gap-3 md:grid-cols-3">
          <ConstraintColumn title="固定约束" items={map.constraints.fixed} />
          <ConstraintColumn
            title="可以影响"
            items={map.constraints.influenceable}
          />
          <ConstraintColumn
            title="现在可行动"
            items={map.constraints.actionable_now}
          />
        </div>
      </MapSection>

      <MapSection icon={AlertTriangle} number="07" title="矛盾与盲区">
        <div className="rounded-md border border-orange-300 bg-orange-50 p-4 text-orange-950">
          <TextList items={map.contradictions} />
        </div>
      </MapSection>

      <MapSection icon={ArrowRight} number="08" title="下一步路径">
        <div className="grid gap-3 lg:grid-cols-3">
          {map.paths.map((path, index) => {
            const chosen = selectedPath?.type === path.type;
            return (
              <div
                key={path.type}
                className={
                  "flex flex-col rounded-lg border p-4 " +
                  (chosen ? "border-foreground bg-foreground text-background" : "bg-card")
                }
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-60">
                  {PATH_LABEL[path.type]}
                </div>
                <h4 className="mt-3 text-sm font-medium">{path.title}</h4>
                <p className="mt-3 text-xs leading-5 opacity-75">{path.rationale}</p>
                <div className="mt-4 border-t pt-3 text-xs leading-5">
                  <div className="opacity-60">动作</div>
                  <p className="mt-1">{path.action}</p>
                </div>
                <div className="mt-3 text-xs leading-5">
                  <div className="opacity-60">主要风险</div>
                  <p className="mt-1">{path.risk}</p>
                </div>
                {onSelectPath && !selectedPath && (
                  <button
                    type="button"
                    onClick={() => onSelectPath(index)}
                    className="mt-5 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted hover:text-foreground"
                  >
                    选择这条路径
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {selectedPath && (
          <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="text-xs text-muted-foreground">你的选择</div>
            <p className="mt-2 font-medium">
              {customAction?.trim() || selectedPath.action}
            </p>
            {selectionReason && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                原因：{selectionReason}
              </p>
            )}
            {reviewDueAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                复查：{new Date(reviewDueAt).toLocaleDateString("zh-CN")}
              </p>
            )}
          </div>
        )}
      </MapSection>

      {selectedPath && (
        <MapSection icon={Lightbulb} number="09" title="继续深化">
          <ReasoningBridge pathType={selectedPath.type} />
        </MapSection>
      )}
    </div>
  );
}

const REASONING_BRIDGE: Record<
  "investigate" | "act" | "wait",
  { tool: string; href: string; reason: string; cta: string }
> = {
  investigate: {
    tool: "贝叶斯信念追踪",
    href: "/reasoning/bayesian/new",
    reason: "调查前先写下你相信什么，调查后更新——防止你只记住支持自己的证据。",
    cta: "建立信念追踪",
  },
  act: {
    tool: "费米估算",
    href: "/reasoning/fermi/new",
    reason: "行动前估算关键数字（成本/时间/规模），把大问题拆解为可乘的组成部分，防止直觉失准。",
    cta: "开始估算",
  },
  wait: {
    tool: "认知重构",
    href: "/reasoning/reframing/new",
    reason: "等待期间用 26 种视角重新审视这个课题，也许有你没想到的角度能改变决策。",
    cta: "换个视角看",
  },
};

const REFRAMING_SECONDARY = {
  tool: "认知重构",
  href: "/reasoning/reframing/new",
  reason: "对任何路径都适用——26 种维度打破思维定势，看清还没想到的可能性。",
  cta: "换个视角看",
};

const BAYESIAN_SECONDARY = {
  tool: "贝叶斯信念追踪",
  href: "/reasoning/bayesian/new",
  reason: "等待期间也可以先声明你现在相信什么，之后有了新信息再更新——防止事后诸葛亮。",
  cta: "建立信念追踪",
};

function ReasoningBridge({
  pathType,
}: {
  pathType: "investigate" | "act" | "wait";
}) {
  const primary = REASONING_BRIDGE[pathType];
  // "wait" 的 primary 已经是重构，避免重复；改用 Bayesian 作为次要推荐
  const secondary =
    pathType === "wait" ? BAYESIAN_SECONDARY : REFRAMING_SECONDARY;

  const cards = [primary, secondary];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="group flex flex-col gap-2 rounded-lg border bg-card p-4 hover:border-foreground/40 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{card.tool}</span>
            <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
              {card.cta} →
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {card.reason}
          </p>
        </Link>
      ))}
    </div>
  );
}

function MapSection({
  icon: Icon,
  number,
  title,
  children,
}: {
  icon: typeof Gauge;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{number}</span>
        <Icon className="size-4" strokeWidth={1.7} />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm leading-6">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ConstraintColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="mt-3">
        <TextList items={items} />
      </div>
    </div>
  );
}

function DeltaBlock({ delta }: { delta: RealityDelta }) {
  const groups = [
    ["新增事实", delta.added_facts],
    ["修正解释", delta.revised_interpretations],
    ["解决的未知", delta.resolved_unknowns],
    ["新增未知", delta.new_unknowns],
    ["情绪变化", delta.emotion_changes],
  ] as const;
  return (
    <section className="rounded-lg border bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Since previous version
      </p>
      <h3 className="mt-2 text-sm font-medium">这次认识发生了什么变化</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title}>
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="mt-1">
              {items.length > 0 ? (
                <TextList items={items} />
              ) : (
                <span className="text-xs text-muted-foreground">没有明确变化</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {(delta.previous_path_result || delta.change_reason) && (
        <div className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">上次路径结果</div>
            <p className="mt-1 text-sm">{delta.previous_path_result || "未记录"}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">变化原因</div>
            <p className="mt-1 text-sm">{delta.change_reason || "未记录"}</p>
          </div>
        </div>
      )}
    </section>
  );
}
