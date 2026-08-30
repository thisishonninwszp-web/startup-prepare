import {
  Crosshair,
  Dumbbell,
  Footprints,
  Handshake,
  HeartPulse,
  Mountain,
  Sparkles,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import type { SelfTier } from "@/lib/domains/self-model/tiers";
import type {
  Domain,
  MainAttribute,
  MainKey,
  SubAttribute,
} from "@/lib/domains/self-model/panel";
import {
  TIER_LABELS as QUEST_TIER_LABELS,
  buildQuests,
  levelFromExp,
  tallyKills,
  type Quest,
} from "@/lib/domains/self-model/quests";
import {
  POLARITY_LABELS,
  RARITY_LABELS,
  type Rarity,
  type Trait,
} from "@/lib/domains/self-model/traits";
import {
  SKILL_GROUPS,
  SKILL_GROUP_NAMES,
} from "@/lib/domains/self-model/skills";
import {
  getSelfLedger,
  getSelfPanel,
  getSelfSkills,
  getSelfTraits,
  type SelfLedgerEntry,
} from "./queries";
import {
  CharacterCreationForm,
  SettleSkillsButton,
  TakeFeatButton,
  TickControl,
} from "./skill-forms";
import {
  BodyLogForm,
  EncounterForm,
  KIND_LABELS,
  NewHypothesisForm,
  FadeTraitControl,
  NewPredictionForm,
  NewTraitForm,
  RefuteControl,
  ResolveControls,
  ResourcesForm,
  SleepForm,
  WindowForm,
} from "./self-forms";

export const dynamic = "force-dynamic";

const TIER_LABELS: Record<SelfTier, string> = {
  hunch: "猜想",
  working: "工作假设",
  load_bearing: "可承重",
  refuted: "已推翻",
  archived: "已归档",
};

const TIER_VARIANTS: Record<SelfTier, "default" | "secondary" | "outline" | "muted"> =
  {
    hunch: "muted",
    working: "outline",
    load_bearing: "default",
    refuted: "secondary",
    archived: "muted",
  };

function formatDay(value: string): string {
  return value.slice(0, 10);
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="self-panel space-y-0.5 px-4 py-3">
      <p className="self-label">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const MAIN_ICONS: Record<MainKey, LucideIcon> = {
  STR: Dumbbell,
  CON: HeartPulse,
  DEX: Zap,
  INT: Crosshair,
  WIS: Footprints,
  CHA: Handshake,
  WIL: Mountain,
  LCK: Sparkles,
  RES: Wallet,
};

const DOMAIN_LABELS: Record<Domain, string> = {
  work: "工",
  body: "身",
  people: "人",
  self: "己",
};

const DOMAIN_NOTES: Record<Domain, string> = {
  work: "数据最多，也最容易骗自己：同一个情境重复十次，不等于跨了十个情境。",
  body: "唯一一处叙述插不上手的地方 —— 举不起来就是举不起来。",
  people: "你的盲点只能从这里来，自己回忆照不出自己看不见的东西。",
  self: "睡眠、跑道、时间、意义感 —— 它们是上面三个域所有数字的控制变量。",
};

function DomainChip({ domain }: { domain: Domain }) {
  return (
    <span className="inline-block shrink-0 border px-1 font-mono text-[9px] font-semibold leading-4 text-muted-foreground">
      {DOMAIN_LABELS[domain]}
    </span>
  );
}

function SubRow({ sub }: { sub: SubAttribute }) {
  const known = sub.value !== null;
  return (
    <div className="self-row flex items-baseline gap-2 py-1.5 text-[13px]">
      <DomainChip domain={sub.domain} />
      <span className={known ? "" : "text-muted-foreground"}>{sub.name}</span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
        {known ? sub.basis : sub.need}
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
        {known ? sub.value : "—"}
      </span>
    </div>
  );
}

function MainCard({ main }: { main: MainAttribute }) {
  const Icon = MAIN_ICONS[main.key];
  const known = main.level !== null;
  return (
    <div className="self-panel">
      <div className="self-panel__head">
        <Icon
          className="size-4 shrink-0 self-center text-muted-foreground"
          strokeWidth={1.7}
          aria-hidden
        />
        <span className="self-label">{main.key}</span>
        <span className="text-lg font-semibold">{main.name}</span>
        <span
          className={`ml-auto font-mono text-sm font-semibold tabular-nums ${
            known ? "" : "text-muted-foreground"
          }`}
        >
          {known ? `Lv.${main.level}` : "Lv.—"}
        </span>
      </div>
      <div className="self-panel__body pt-2.5">
        <div className="h-1.5 overflow-hidden rounded-md bg-muted">
          {known && (
            <span
              className="block h-full bg-primary"
              style={{ width: `${((main.level ?? 0) / 20) * 100}%` }}
            />
          )}
        </div>
        <div className="mt-2">
          {main.subs.map((sub) => (
            <SubRow key={sub.key} sub={sub} />
          ))}
        </div>
      </div>
    </div>
  );
}

const QUEST_MARKS: Record<Quest["tier"], string> = {
  boss: "🐉",
  elite: "🐺",
  trash: "🐀",
};

function QuestRow({ quest }: { quest: Quest }) {
  return (
    <div className="flex gap-3 border-b py-3 last:border-b-0">
      <span className="w-6 shrink-0 text-center text-base leading-6">
        {QUEST_MARKS[quest.tier]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium">{quest.name}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {QUEST_TIER_LABELS[quest.tier]}
          </span>
          <DomainChip domain={quest.domain} />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{quest.action}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          掉落 ▸ {quest.drop}
        </p>
      </div>
      <span className="shrink-0 whitespace-nowrap font-mono text-xs font-semibold text-primary">
        {quest.attribute} +{quest.exp}
      </span>
    </div>
  );
}


/** 七品级的配色定义在 globals.css 的 .self-sheet 作用域里，页面不自建颜色映射。 */
const RARITY_CLASS: Record<Rarity, string> = {
  common: "self-rarity--common",
  magic: "self-rarity--magic",
  rare: "self-rarity--rare",
  epic: "self-rarity--epic",
  legend: "self-rarity--legend",
  set: "self-rarity--set",
  unique: "self-rarity--unique",
};

function TraitCard({ trait }: { trait: Trait }) {
  const faded = trait.status === "faded";
  return (
    <div className={`self-panel space-y-2 p-5 ${faded ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{trait.name}</span>
        <span className={`self-rarity ${RARITY_CLASS[trait.rarity]}`}>
          {RARITY_LABELS[trait.rarity]} · {POLARITY_LABELS[trait.polarity]}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          光谱 {trait.spectrumKey}
        </span>
        {faded && (
          <span className="font-mono text-[11px] text-muted-foreground">已褪色</span>
        )}
      </div>

      <div className="space-y-0.5 text-[13px]">
        {trait.modifiers.map((modifier, index) => (
          <div key={index} className="flex items-baseline gap-2">
            <span
              className={`w-3 shrink-0 font-mono ${
                modifier.sign === "plus" ? "text-foreground" : "text-primary"
              }`}
            >
              {modifier.sign === "plus" ? "+" : "−"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {modifier.sub}
            </span>
            <span className="ml-auto font-mono text-[11px]">{modifier.note}</span>
          </div>
        ))}
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">
        {trait.verdict}
      </p>

      {trait.backfire && (
        <p className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">
          ⚔ 反噬：{trait.backfire}
          {trait.equipNote && <> · 装备条件：{trait.equipNote}</>}
        </p>
      )}

      {trait.refusedOffer && (
        <p className="text-xs text-muted-foreground">
          为它推掉过：{trait.refusedOffer}
        </p>
      )}

      {trait.blocked.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {trait.blocked.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      {!faded && <FadeTraitControl traitId={trait.id} />}
    </div>
  );
}

function HypothesisCard({ entry }: { entry: SelfLedgerEntry }) {
  const { hypothesis, intensity, contexts, evaluation, windows, predictions } =
    entry;
  const settled = predictions.filter((p) => p.outcome !== "pending");
  const isClosed =
    hypothesis.tier === "refuted" || hypothesis.tier === "archived";

  return (
    <div className="self-panel space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {hypothesis.code}
            {hypothesis.tier === "refuted" && (
              <span className="self-stamp">REVISED</span>
            )}
          </p>
          <p className="mt-0.5 font-medium leading-relaxed">
            {hypothesis.statement}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="muted">{KIND_LABELS[hypothesis.kind]}</Badge>
          <Badge variant={TIER_VARIANTS[hypothesis.tier]}>
            {TIER_LABELS[hypothesis.tier]}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
        <span>
          触发率{" "}
          <span className="text-foreground">
            {intensity.displayable
              ? `${intensity.rate}%`
              : `样本 ${intensity.total}，暂不显示比率`}
          </span>
          {intensity.displayable && ` (${intensity.hits}/${intensity.total})`}
        </span>
        <span>情境 {contexts} 类</span>
        <span>
          事前预测 {settled.filter((p) => p.outcome === "hit").length}/
          {settled.length} 命中
        </span>
        <span>首次观察 {hypothesis.first_observed}</span>
      </div>

      {hypothesis.tier === "refuted" && hypothesis.refuted_reason && (
        <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">
          推翻理由：{hypothesis.refuted_reason}
        </p>
      )}

      {!isClosed && evaluation.reasons.length > 0 && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p className="mb-0.5 font-medium text-foreground">
            {evaluation.changed
              ? `档位已变化 → ${TIER_LABELS[evaluation.tier]}`
              : "还差什么才能升档"}
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {evaluation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {windows.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            触发窗口 {windows.length} 条
          </summary>
          <ul className="mt-2 space-y-1.5">
            {windows.map((item) => (
              <li key={item.id} className="flex gap-2 text-xs">
                <span className="font-mono text-muted-foreground">
                  {item.occurred_on} {item.grade}
                </span>
                <span
                  className={
                    item.outcome === "hit"
                      ? "font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {item.outcome === "hit" ? "发生" : "未发生"}
                </span>
                <span className="min-w-0 flex-1">
                  [{item.context_key}] {item.situation}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!isClosed && (
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <WindowForm hypothesisId={hypothesis.id} />
          <div className="min-w-[220px] flex-1">
            <RefuteControl hypothesisId={hypothesis.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export default async function SelfPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [ledger, panel] = await Promise.all([
    getSelfLedger(user!.id),
    getSelfPanel(user!.id),
  ]);
  const { traits, sets } = await getSelfTraits(user!.id, ledger);

  const { calibration, entries, pending } = ledger;
  const active = entries.filter(
    (entry) =>
      entry.hypothesis.tier !== "refuted" && entry.hypothesis.tier !== "archived"
  );
  const closed = entries.filter(
    (entry) =>
      entry.hypothesis.tier === "refuted" || entry.hypothesis.tier === "archived"
  );
  const overdue = pending.filter((p) => new Date(p.due_at) < new Date());
  const heldTraits = traits.filter((trait) => trait.status === "held");
  const fadedTraits = traits.filter((trait) => trait.status === "faded");

  const windows = entries.flatMap((entry) => entry.windows);
  const kills = tallyKills({
    windowsTotal: windows.length,
    windowsStrong: windows.filter(
      (window) => window.grade === "E3" || window.grade === "E4"
    ).length,
    settledPredictions: calibration.settled,
    refutedHypotheses: entries.filter(
      (entry) => entry.hypothesis.tier === "refuted"
    ).length,
    bodyLogs: panel.bodyLogs,
    concludedBattles: panel.concludedBattles,
    litDomains: panel.panel.domains.filter((domain) => domain.lit > 0).length,
  });
  const progress = levelFromExp(kills.exp);
  const skillState = await getSelfSkills(user!.id, {
    level: progress.level,
    traits: traits
      .filter((trait) => trait.status === "held")
      .map((trait) => trait.name),
    settledForecasts: calibration.settled,
    litDomains: panel.panel.domains.filter((domain) => domain.lit > 0).length,
  });
  const openTicks = skillState.skills.reduce(
    (sum, skill) => sum + skill.ticks,
    0
  );

  const quests = buildQuests({
    hypotheses: entries.map((entry) => ({
      id: entry.hypothesis.id,
      code: entry.hypothesis.code,
      statement: entry.hypothesis.statement,
      contexts: entry.contexts,
      hasPendingPrediction: entry.predictions.some(
        (prediction) => prediction.outcome === "pending"
      ),
      closed:
        entry.hypothesis.tier === "refuted" ||
        entry.hypothesis.tier === "archived",
    })),
    overduePredictions: overdue.map((prediction) => ({
      id: prediction.id,
      text: prediction.text,
    })),
    darkDomains: panel.panel.domains
      .filter((domain) => domain.lit === 0)
      .map((domain) => domain.domain),
    uncollected: panel.panel.mains
      .flatMap((main) => main.subs)
      .filter((sub) => sub.basis === "尚未采集")
      .map((sub) => ({
        key: sub.key,
        name: sub.name,
        main: sub.main,
        domain: sub.domain,
      })),
  });

  return (
    <PageContainer className="self-sheet">
      <PageHeader
        eyebrow="SELF"
        title="自我"
        description="关于自己的判断，只有先押注、再挨打，才算数。这里不给人格标签，只记可证伪的条件命题。"
      />

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat
          label="character level"
          value={`Lv.${progress.level}`}
          sub={`距下一级 ${progress.toNext} exp`}
        />
        <Stat
          label="kills"
          value={`${kills.total}`}
          sub={`小怪 ${kills.trash} · 精英 ${kills.elite} · BOSS ${kills.boss}`}
        />
        <Stat
          label="coverage"
          value={`${panel.panel.lit}/${panel.panel.total}`}
          sub="已点亮的子属性"
        />
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">本周怪物</h2>
          <p className="text-sm text-muted-foreground">
            分档标准只有一条：你有多想躲开它。
          </p>
        </div>
        {quests.length === 0 ? (
          <EmptyState
            title="没有怪可打"
            description="台账是空的，或者手上的假设都已经在押注中。先建一条假设，怪自己会出现。"
          />
        ) : (
          <div className="self-panel px-5 py-1">
            {quests.map((quest) => (
              <QuestRow key={quest.id} quest={quest} />
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          等级量的是你打了多少，不是你多好。经验不抬属性 ——
          去做那件事会产生数据，数据才让属性动。
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">域覆盖</h2>
          <p className="text-sm text-muted-foreground">
            同一个人被照亮的面积。暗着的域才是要去点的地方。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {panel.panel.domains.map((domain) => (
            <div key={domain.domain} className="self-panel p-4">
              <div className="flex items-baseline gap-2">
                <DomainChip domain={domain.domain} />
                <span className="font-medium">{domain.name}</span>
                <span className="ml-auto font-mono text-base font-semibold tabular-nums">
                  {domain.lit}
                  <span className="text-xs font-normal text-muted-foreground">
                    /{domain.total}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: domain.total }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-2 flex-1 rounded-sm border ${
                      index < domain.lit ? "border-primary bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {DOMAIN_NOTES[domain.domain]}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm">
          整体 {panel.panel.lit}/{panel.panel.total}。
          一条假设要升成「特质」需要跨 3 类情境 ——
          <span className="text-muted-foreground">
            {" "}
            只有工作这一个域亮着的时候，台账里没有任何一条能升上去。
          </span>
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">技能</h2>
          <p className="text-sm text-muted-foreground">
            只有实际用过、并且有结果，才打一个勾。看教程不算。
          </p>
        </div>

        {!skillState.started ? (
          <div className="self-panel p-5">
            <h3 className="mb-3 text-sm font-medium">建卡</h3>
            <CharacterCreationForm />
          </div>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {SKILL_GROUPS.map((group) => {
                const rows = skillState.skills.filter(
                  (skill) => skill.group === group
                );
                return (
                  <div key={group} className="self-panel">
                    <div className="self-panel__head">
                      <span className="self-label">{group}</span>
                      <span className="text-sm font-medium">
                        {SKILL_GROUP_NAMES[group]}
                      </span>
                    </div>
                    <div className="self-panel__body pt-1">
                      {rows.map((skill) => (
                        <div
                          key={skill.key}
                          className="self-row flex flex-wrap items-center gap-2 py-1.5 text-[13px]"
                        >
                          <span className="min-w-[7rem] flex-1">{skill.name}</span>
                          {skill.passion > 0 && (
                            <span aria-label="激情">
                              {"🔥".repeat(skill.passion)}
                            </span>
                          )}
                          {skill.ticks > 0 && (
                            <span className="font-mono text-[11px] text-primary">
                              ✓{skill.ticks} → +{skill.pendingGrowth}
                            </span>
                          )}
                          {skill.rust < 0 && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              生锈 {skill.rust}
                            </span>
                          )}
                          <span className="w-9 text-right font-mono text-xs font-semibold tabular-nums">
                            {skill.value}
                          </span>
                          <TickControl
                            skillKey={skill.key}
                            skillName={skill.name}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="self-panel p-5">
              <h3 className="mb-2 text-sm font-medium">结算</h3>
              <SettleSkillsButton pendingTicks={openTicks} />
            </div>
          </>
        )}
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">专长</h2>
          <p className="text-sm text-muted-foreground">
            每升 2 级给 1 点 · 剩余{" "}
            <span className="font-mono font-semibold text-foreground">
              {skillState.featPointsLeft}
            </span>{" "}
            点
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {skillState.feats.map((feat) => (
            <div
              key={feat.def.key}
              className={`self-panel p-4 ${feat.taken ? "" : feat.unlocked ? "" : "opacity-70"}`}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {feat.taken ? "●" : feat.unlocked ? "◐" : "○"}
                </span>
                <span className="font-medium">{feat.def.name}</span>
                {feat.taken && (
                  <span className="self-label">已点</span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {feat.def.effect}
              </p>
              {feat.missing.length > 0 && (
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                  差：{feat.missing.join(" · ")}
                </p>
              )}
              {feat.unlocked && (
                <div className="mt-2">
                  <TakeFeatButton
                    featKey={feat.def.key}
                    disabled={skillState.featPointsLeft <= 0}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">特性</h2>
          <p className="text-sm text-muted-foreground">
            挂在子属性上的带符号修正。品级是算出来的，不是评出来的。
          </p>
        </div>

        {sets.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {sets.map((set) => (
              <div key={set.key} className="self-panel p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">套装「{set.key}」</span>
                  <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                    {set.held}/{set.size}
                  </span>
                </div>
                <ul className="mt-2 space-y-0.5 text-[13px]">
                  {set.members.map((member) => (
                    <li key={member.id} className="flex gap-2">
                      <span className="font-mono text-xs">
                        {member.status === "held" ? "✓" : "✗"}
                      </span>
                      <span
                        className={
                          member.status === "held" ? "" : "text-muted-foreground"
                        }
                      >
                        {member.name}
                      </span>
                    </li>
                  ))}
                </ul>
                {set.effect && (
                  <p className="mt-2 border-l-2 border-primary pl-3 text-xs text-muted-foreground">
                    {set.complete ? "已解锁：" : "集齐解锁："}
                    {set.effect}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {heldTraits.length === 0 ? (
          <EmptyState
            title="还没有特性"
            description="特性是从假设长出来的：先有一条站得住的假设，再把它对哪些子属性有加成、对哪些有拖累写下来。"
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {heldTraits.map((trait) => (
              <TraitCard key={trait.id} trait={trait} />
            ))}
          </div>
        )}

        <div className="self-panel p-5">
          <NewTraitForm
            subs={panel.panel.mains.flatMap((main) =>
              main.subs.map((sub) => ({
                key: sub.key,
                label: `${main.name} · ${sub.name}`,
              }))
            )}
            hypotheses={active.map((entry) => ({
              id: entry.hypothesis.id,
              code: entry.hypothesis.code,
              statement: entry.hypothesis.statement,
            }))}
          />
        </div>

        {fadedTraits.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              已褪色的特性（{fadedTraits.length} 条）
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {fadedTraits.map((trait) => (
                <TraitCard key={trait.id} trait={trait} />
              ))}
            </div>
          </details>
        )}
      </section>

      <Separator className="my-8" />

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">属性</h2>
          <p className="text-sm text-muted-foreground">
            九主 / 二十六子。子属性扛数值与域，主属性只做同量纲合成，跨属性永不求和。
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {panel.panel.mains.map((main) => (
            <MainCard key={main.key} main={main} />
          ))}
        </div>

        {panel.spread.spread !== null && panel.spread.strongest && (
          <p className="text-sm text-muted-foreground">
            特化度 {panel.spread.spread} —— 最强
            <span className="text-foreground">
              {" "}
              {panel.spread.strongest.name} Lv.{panel.spread.strongest.level}
            </span>
            ，最弱
            <span className="text-foreground">
              {" "}
              {panel.spread.weakest?.name} Lv.{panel.spread.weakest?.level}
            </span>
            。数字越大说明你越吃环境：峰值高，但换个场子就掉得快。
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="self-panel p-5">
            <h3 className="mb-1 text-sm font-medium">记一条训练</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              身体是你的第二类情境，也是唯一一处叙述插不上手的数据。
            </p>
            <BodyLogForm />
          </div>

          <div className="self-panel p-5">
            <h3 className="mb-1 text-sm font-medium">记一次与人的互动</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              人际域只能从这里亮 —— 自己回忆照不出自己看不见的东西。
            </p>
            <EncounterForm />
          </div>

          <div className="self-panel p-5">
            <h3 className="mb-1 text-sm font-medium">底牌快照</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              这三个数决定你现在能打几级本，而大多数人从来没写下来过。
            </p>
            <ResourcesForm />
          </div>

          <div className="self-panel p-5">
            <h3 className="mb-3 text-sm font-medium">今天的睡眠</h3>
            <SleepForm />
            <p className="mt-3 text-xs text-muted-foreground">
              算的是「睡够 7 小时的天数占比」，不是平均时长 ——
              平均值会把「五天四小时 + 两天十二小时」洗成健康。
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat
          label="self forecast"
          value={
            calibration.hitRate === null
              ? `${calibration.hits}/${calibration.settled}`
              : `${calibration.hits}/${calibration.settled}`
          }
          sub={
            calibration.hitRate === null
              ? "已结算不足 5 条，暂不算命中率"
              : `命中率 ${calibration.hitRate}%`
          }
        />
        <Stat
          label="calibration"
          value={calibration.offset === null ? "—" : `${calibration.offset > 0 ? "+" : ""}${calibration.offset}`}
          sub={
            calibration.offset === null
              ? "样本够了才给校准偏移"
              : calibration.offset > 0
                ? "把握度高于实际，系统性高估"
                : "把握度低于实际，系统性低估"
          }
        />
        <Stat
          label="ledger"
          value={`${active.length}`}
          sub={`在验证中的假设 · 已推翻或归档 ${closed.length} 条`}
        />
      </section>

      <section className="mb-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">押注</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            在去验证之前先写下你的预判。这是唯一能推动档位上升的证据。
          </p>
        </div>

        {pending.length === 0 ? (
          <EmptyState
            title="还没有待结算的预测"
            description="下一次你准备替别人回答“他肯定会说不需要”的时候，先把它押在这里。"
          />
        ) : (
          <div className="space-y-2">
            {pending.map((item) => {
              const isOverdue = new Date(item.due_at) < new Date();
              return (
                <div
                  key={item.id}
                  className="self-panel flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-[240px] flex-1">
                    <p className="text-sm">{item.text}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      到期 {formatDay(item.due_at)}
                      {item.confidence !== null && ` · 把握 ${item.confidence}%`}
                      {isOverdue && " · 已到期"}
                    </p>
                  </div>
                  <ResolveControls predictionId={item.id} />
                </div>
              );
            })}
          </div>
        )}

        {overdue.length > 0 && (
          <p className="text-sm text-primary">
            有 {overdue.length} 条已到期没对账。不对账的预测等于没押过。
          </p>
        )}

        <div className="self-panel p-5">
          <h3 className="mb-3 text-sm font-medium">押一条新的</h3>
          <NewPredictionForm
            hypotheses={active.map((entry) => ({
              id: entry.hypothesis.id,
              code: entry.hypothesis.code,
              statement: entry.hypothesis.statement,
            }))}
          />
        </div>
      </section>

      <Separator className="my-8" />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">假设台账</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            自述不进这里。只有能写出触发条件、并且数得出分母的，才算一条假设。
          </p>
        </div>

        {active.length === 0 ? (
          <EmptyState
            title="台账是空的"
            description="第一条假设可以从最近一次“你预判了对方的回答然后跳过了提问”开始。"
          />
        ) : (
          <div className="space-y-4">
            {active.map((entry) => (
              <HypothesisCard key={entry.hypothesis.id} entry={entry} />
            ))}
          </div>
        )}

        <div className="self-panel p-5">
          <h3 className="mb-3 text-sm font-medium">新建假设</h3>
          <NewHypothesisForm />
        </div>

        {closed.length > 0 && (
          <details className="pt-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              我曾经以为（{closed.length} 条）
            </summary>
            <div className="mt-4 space-y-4">
              {closed.map((entry) => (
                <HypothesisCard key={entry.hypothesis.id} entry={entry} />
              ))}
            </div>
          </details>
        )}
      </section>
    </PageContainer>
  );
}
