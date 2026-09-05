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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  fleeAdjustedExp,
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
} from "@/lib/domains/self-model/skills";
import {
  buildProgress,
  evaluateTitles,
  matchBuild,
} from "@/lib/domains/self-model/titles";
import { priorFor } from "@/lib/domains/self-model/deeds";
import {
  getSelfLedger,
  getSelfPanel,
  getDispositions,
  getNpcs,
  getQuestSightings,
  getSelfDeeds,
  getSelfEvents,
  getDeclarations,
  getSkillTree,
  getSelfTraits,
  getWeeklyReport,
  recordDerivedEvents,
  type SelfLedgerEntry,
} from "./queries";
import {
  byAxis,
  matchTypes,
  stateOf,
} from "@/lib/domains/self-model/dispositions";
import { classFits } from "@/lib/domains/self-model/classes";
import { crossovers } from "@/lib/domains/self-model/paths";
import { SkillTree } from "./skill-tree";
import {
  DeedForm,
  DispositionSuggest,
  DispositionToggle,
  PromoteDispositionButton,
  QuestRollCall,
  ScanLibraryButton,
} from "./skill-forms";
import {
  ArchiveDeclarationControl,
  BodyLogForm,
  DeclarationForm,
  SketchControl,
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
    <div className="self-panel self-corners space-y-0.5 px-4 py-3">
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

function MainCard({
  main,
  crafts,
}: {
  main: MainAttribute;
  crafts: { name: string; reached: number; unlocked: number; total: number }[];
}) {
  const Icon = MAIN_ICONS[main.key];
  const known = main.level !== null;
  const top = [...crafts]
    .sort((a, b) => b.unlocked - a.unlocked)
    .filter((craft) => craft.unlocked > 0)
    .slice(0, 3);
  const startedCrafts = crafts.filter((craft) => craft.reached > 0).length;
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

        {crafts.length > 0 && (
          <div className="mt-3 border-t pt-2">
            <p className="self-label mb-1">
              手艺 {crafts.length} 门 · 开了 {startedCrafts} 门
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
              {top.length > 0 ? (
                top.map((craft) => (
                  <span key={craft.name}>
                    {craft.name}{" "}
                    <span className="font-semibold text-foreground">
                      {STAGE_LABELS[craft.reached] ?? "—"}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      {craft.unlocked}/{craft.total}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">一个小技能都还没点</span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              手艺不加成属性：属性是行为算出来的，手艺是你自己一格格点亮的。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


/** 0 = 还没过任何一级。 */
const STAGE_LABELS = ["未开", "入门", "基础", "精通", "专家"];

const EVENT_MARKS: Record<string, string> = {
  trait_granted: "🟢",
  trait_faded: "⚪",
  skill_up: "⬆",
  skill_rust: "⬇",
  feat_taken: "⚔",
  title_earned: "🏅",
  build_changed: "🔀",
  hypothesis_refuted: "🔴",
  tier_changed: "▲",
};

const QUEST_MARKS: Record<Quest["tier"], string> = {
  boss: "🐉",
  elite: "🐺",
  trash: "🐀",
};


/**
 * 周战报。同一批数据，换个语气 —— 它的全部作用是让人愿意每周打开这一页。
 * 只讲"你做了什么"，不讲"你还差什么"：后者是怪物清单的活。
 */
function WeeklyReport({
  report,
}: {
  report: Awaited<ReturnType<typeof getWeeklyReport>>;
}) {
  const lines: { mark: string; text: string }[] = [];

  if (report.contacts > 0) {
    lines.push({
      mark: "›",
      text: `对真人发起 ${report.contacts} 次接触，命中 ${report.contactHits}`,
    });
  }
  if (report.serendipities > 0) {
    lines.push({
      mark: "💥",
      text: `暴击 ${report.serendipities} 次 —— 意料之外的收获`,
    });
  }
  if (report.windows > 0) {
    lines.push({
      mark: "›",
      text: `记下 ${report.windows} 个触发窗口，其中 ${report.windowMisses} 次「符合条件但没那么做」`,
    });
  }
  if (report.settled > 0) {
    lines.push({
      mark: report.settledHits >= report.settled - report.settledHits ? "🎯" : "🩸",
      text: `对账 ${report.settled} 条预测，命中 ${report.settledHits}`,
    });
  }
  if (report.ticks > 0) {
    lines.push({ mark: "✓", text: `技能打勾 ${report.ticks} 次` });
  }
  if (report.lifts > 0 || report.cardioMinutes > 0) {
    lines.push({
      mark: "🏋",
      text: `举铁 ${report.lifts} 组 · 有氧 ${Math.round(report.cardioMinutes)} 分钟`,
    });
  }
  if (report.encounters > 0) {
    lines.push({ mark: "🤝", text: `与人的记录 ${report.encounters} 条` });
  }
  if (report.sleepNights > 0) {
    lines.push({
      mark: "🌙",
      text: `记了 ${report.sleepNights} 夜睡眠，睡够 7 小时 ${report.sleepEnough} 夜`,
    });
  }

  return (
    <div className="self-panel">
      <div className="self-panel__head">
        <span className="self-label">weekly</span>
        <span className="text-sm font-medium">上一周</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {report.from} 起
        </span>
      </div>
      <div className="self-panel__body space-y-1 font-mono text-[13px]">
        {report.quiet ? (
          <p className="text-muted-foreground">
            这一周什么都没发生。不是坏事，但也别假装它发生过 ——
            战报只写真的做过的事。
          </p>
        ) : (
          lines.map((line) => (
            <p key={line.text} className="flex gap-2">
              <span className="w-4 shrink-0 text-muted-foreground">
                {line.mark}
              </span>
              <span>{line.text}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function QuestRow({
  quest,
  weeksSeen,
}: {
  quest: Quest;
  weeksSeen: number;
}) {
  const fled = Math.max(0, weeksSeen - 1);
  const exp = fleeAdjustedExp(quest.exp, weeksSeen);
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
        {quest.taunt && (
          <p className="mt-0.5 border-l-2 border-primary pl-2.5 text-sm italic text-primary">
            {quest.taunt}
          </p>
        )}
        <p className="mt-0.5 text-sm text-muted-foreground">{quest.action}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          掉落 ▸ {quest.drop}
        </p>
        {fled > 0 && (
          <p className="mt-1 font-mono text-[11px] text-primary">
            已出现 {weeksSeen} 周 · 你从它面前走开过 {fled} 次
          </p>
        )}
      </div>
      <span className="shrink-0 whitespace-nowrap text-right font-mono text-xs font-semibold text-primary">
        {quest.attribute} +{exp}
        {exp !== quest.exp && (
          <span className="block text-[10px] font-normal text-muted-foreground">
            逃跑加成 ×{(exp / quest.exp).toFixed(2)}
          </span>
        )}
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

function TraitCard({
  trait,
}: {
  trait: Trait & { strength: number | null };
}) {
  const faded = trait.status === "faded";
  return (
    <div className={`self-panel space-y-2 p-5 ${faded ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{trait.name}</span>
        {trait.strength !== null && (
          <span className="font-mono text-lg font-semibold tabular-nums">
            {trait.strength}
            <span className="text-[10px] font-normal text-muted-foreground">
              /20
            </span>
          </span>
        )}
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
  const { traits, sets } = await getSelfTraits(
    user!.id,
    ledger,
    Object.fromEntries(
      panel.panel.mains.flatMap((main) =>
        main.subs.map((sub) => [sub.key, sub.value])
      )
    )
  );
  const [report, npcs, events, sightings, deedData, dispositions] =
    await Promise.all([
    getWeeklyReport(user!.id),
    getNpcs(user!.id),
    getSelfEvents(user!.id),
    getQuestSightings(user!.id),
    getSelfDeeds(user!.id),
    getDispositions(user!.id, ledger),
  ]);

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
  const skillTree = await getSkillTree(user!.id);
  const declarations = await getDeclarations(user!.id);
  const reachedBySkill = new Map(
    skillTree.entries.map((entry) => [entry.def.key, entry.reached])
  );
  const fits = classFits(reachedBySkill);
  const crosses = crossovers(reachedBySkill);
  const skillNameOf = (key: string) =>
    skillTree.entries.find((entry) => entry.def.key === key)?.def.name ?? key;

  const heldTraitNames = heldTraits.map((trait) => trait.name);
  const build = matchBuild(heldTraitNames);
  const nextBuilds = buildProgress(heldTraitNames).slice(0, 3);

  // 最长连续命中：按结算时间排序后数一遍。
  const settledInOrder = entries
    .flatMap((entry) => entry.predictions)
    .concat(ledger.looseSettled)
    .filter((prediction) => prediction.outcome !== "pending")
    .sort(
      (a, b) =>
        Date.parse(a.resolved_at ?? a.due_at) -
        Date.parse(b.resolved_at ?? b.due_at)
    );
  let streak = 0;
  let longestHitStreak = 0;
  for (const prediction of settledInOrder) {
    streak = prediction.outcome === "hit" ? streak + 1 : 0;
    longestHitStreak = Math.max(longestHitStreak, streak);
  }

  // 称号那套阈值原本读 0–100 的技能值。分数没了，改成把"走到第几级"
  // 换算成同一把尺子：入门 25 / 基础 50 / 精通 75 / 专家 100。
  // 换算只服务于称号判定，界面上不出现这个数。
  const skillValues = skillTree.entries.map((entry) => entry.reached * 25);
  const titles = evaluateTitles({
    level: progress.level,
    kills,
    refuted: entries.filter((entry) => entry.hypothesis.tier === "refuted").length,
    loadBearing: entries.filter(
      (entry) => entry.hypothesis.tier === "load_bearing"
    ).length,
    settledForecasts: calibration.settled,
    hitForecasts: calibration.hits,
    longestHitStreak,
    litDomains: panel.panel.domains.filter((domain) => domain.lit > 0).length,
    coverage: { lit: panel.panel.lit, total: panel.panel.total },
    distinctContexts: panel.raw.distinctContexts,
    windows: windows.length,
    contraryWindows: panel.raw.painNo,
    heldTraits: heldTraitNames,
    uniqueTraits: heldTraits.filter((trait) => trait.rarity === "unique").length,
    completeSets: sets.filter((set) => set.complete).length,
    skillTicks: skillTree.unlockedCount,
    maxSkill: skillValues.length > 0 ? Math.max(...skillValues) : 0,
    skillsAbove: (threshold) =>
      skillValues.filter((value) => value >= threshold).length,
    trainingDays: panel.raw.trainingDays,
    longestSpanDays: panel.raw.longestSpanDays,
    exposures: panel.raw.exposures,
    newFaces: panel.raw.newFaces,
    acceptedProposals: panel.raw.proposalsAccepted,
    commitments: {
      done: panel.raw.commitmentsDone,
      total: panel.raw.commitmentsTotal,
    },
    sleepEnoughDays: panel.raw.sleepEnoughDays,
  });
  const earnedTitles = titles.filter((title) => title.earned);
  // 称号与转职是派生的，没有天然的写入时机：算完之后补记一次，
  // 唯一索引保证同一个称号只会留下一条。
  await recordDerivedEvents(user!.id, {
    earnedTitleKeys: earnedTitles.map((title) => title.def.name),
    buildKey: build?.def.key ?? null,
    buildName: build?.def.name ?? null,
  });

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
    state: {
      hasCharacter: skillTree.unlockedCount > 0,
      openTicks: skillTree.unlockedCount,
      stalled: skillTree.entries
        .filter((entry) => entry.reached >= 1 && entry.next === null)
        .map((entry) => ({
          key: entry.def.key,
          name: entry.def.name,
          stage: STAGE_LABELS[entry.reached] ?? "未开",
        })),
      heldTraitCount: heldTraits.length,
      backfireMissing: heldTraits
        .filter((trait) => trait.polarity === "double" && !trait.backfire)
        .map((trait) => ({ id: trait.id, name: trait.name })),
      refuted: entries.filter((entry) => entry.hypothesis.tier === "refuted")
        .length,
      loadBearing: entries.filter(
        (entry) => entry.hypothesis.tier === "load_bearing"
      ).length,
      calibrationOffset: calibration.offset,
      missStreak: entries
        .filter((entry) => {
          const settled = entry.predictions
            .filter((prediction) => prediction.outcome !== "pending")
            .slice(-2);
          return (
            settled.length === 2 &&
            settled.every((prediction) => prediction.outcome === "miss")
          );
        })
        .map((entry) => ({
          id: entry.hypothesis.id,
          code: entry.hypothesis.code,
        })),
      looseSettled: ledger.looseSettled.length,
      proposalsTotal: panel.raw.proposalsTotal,
      commitments: {
        done: panel.raw.commitmentsDone,
        total: panel.raw.commitmentsTotal,
      },
      litNodes: skillTree.unlockedCount,
      nodeTotal: skillTree.total,
      startedSkills: skillTree.started,
    },
  });

  return (
    <PageContainer className="self-sheet">
      <PageHeader
        eyebrow="SELF"
        title="自我"
        description="关于自己的判断，只有先押注、再挨打，才算数。这里不给人格标签，只记可证伪的条件命题。"
      />

      <section className="mb-6">
        <div className="self-plate self-corners flex flex-wrap items-end gap-x-6 gap-y-3 p-5">
          <div>
            <p className="self-label">流派 · 由持有的特性推出</p>
            <p className="text-2xl font-semibold">
              {build ? `${build.def.mark} ${build.def.name}` : "🚶 游民"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {build
                ? `${build.def.play} · 天然弱点：${build.def.weakness}`
                : "还没有两条特性对上同一种打法。流派不是选的，是长出来的。"}
            </p>
          </div>
          <div className="min-w-[12rem]">
            <p className="self-label">形状 · 由点亮的节点推出</p>
            <p className="text-2xl font-semibold">
              {fits[0].started > 0 ? fits[0].def.name : "未成形"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {fits[0].started > 0
                ? `${fits[0].def.skills.length} 门里入门 ${fits[0].started} 门${
                    fits[0].deep > 0 ? ` · 精通 ${fits[0].deep}` : ""
                  }`
                : "还没有点亮任何小技能。形状不是选的，是走出来的。"}
            </p>
          </div>
          <div className="ml-auto min-w-[14rem]">
            <p className="self-label">离最近的几派还差</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {nextBuilds.map((item) => (
                <li key={item.def.key}>
                  {item.def.mark} {item.def.name} {item.matched.length}/
                  {item.def.traits.length}
                  {item.missing.length > 0 && (
                    <span> · 差 {item.missing.slice(0, 2).join(" · ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

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

      <Tabs defaultValue="overview" className="mt-2">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="attributes">属性</TabsTrigger>
          <TabsTrigger value="skills">技能</TabsTrigger>
          <TabsTrigger value="classes">职业</TabsTrigger>
          <TabsTrigger value="traits">特性</TabsTrigger>
          <TabsTrigger value="ledger">台账</TabsTrigger>
          <TabsTrigger value="deeds">事迹</TabsTrigger>
          <TabsTrigger value="log">记录</TabsTrigger>
        </TabsList>

      <TabsContent value="overview" className="mt-6 space-y-8">
        <div className="self-panel self-corners p-5">
          <p className="self-rule mb-2">
            <span className="self-label shrink-0">速写</span>
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            这一页全是清单。清单不是描述 —— 被人问「你是个什么样的人」，
            从属性表和技能格里搬不出一句话来。速写只有三句：
            他在什么条件下会做什么、这带来了什么、以及它的另一面。
          </p>
          <SketchControl />
        </div>

        <WeeklyReport report={report} />


        <div className="self-panel">
          <div className="self-panel__head">
            <span className="self-label">changelog</span>
            <span className="text-sm font-medium">最近的变化</span>
            <span className="ml-auto text-xs text-muted-foreground">
              其余所有东西都是「现在的状态」，只有这里记得什么时候变的
            </span>
          </div>
          <div className="self-panel__body">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                还没有变化。解锁一条特性、结算一次技能、推翻一条假设 ——
                任何一样发生了，这里就会留下时间。
              </p>
            ) : (
              <div className="space-y-1">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="self-row flex flex-wrap items-baseline gap-x-2 py-1.5 text-[13px]"
                  >
                    <span className="w-5 shrink-0">
                      {EVENT_MARKS[event.kind] ?? "·"}
                    </span>
                    <span className="font-medium">{event.title}</span>
                    {event.detail && (
                      <span className="text-muted-foreground">{event.detail}</span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                      {event.occurred_at.slice(0, 10)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
            <QuestRollCall
              quests={quests.map((quest) => ({
                id: quest.id,
                tier: quest.tier,
                name: quest.name,
              }))}
            />
            {quests.map((quest) => (
              <QuestRow
                key={quest.id}
                quest={quest}
                weeksSeen={sightings.get(quest.id) ?? 0}
              />
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">称号</h2>
          <p className="text-sm text-muted-foreground">
            已获 {earnedTitles.length}/{titles.length} · 不参与任何计算，纯粹是记下来
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {earnedTitles.map((title) => (
            <span
              key={title.def.key}
              className="self-card self-card--rare px-2.5 py-1 text-[13px]"
              title={title.def.requirement}
            >
              <b className="font-semibold">{title.def.name}</b>{" "}
              <span className="text-xs text-muted-foreground">
                {title.def.requirement}
              </span>
            </span>
          ))}
          {earnedTitles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              一个都还没解锁。最容易拿的是「开口」—— 打掉任意一只 BOSS。
            </p>
          )}
        </div>
        {titles.length > earnedTitles.length && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              还没拿到的（{titles.length - earnedTitles.length}）
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {titles
                .filter((title) => !title.earned)
                .map((title) => (
                  <span
                    key={title.def.key}
                    className="self-panel border-dashed px-2.5 py-1 text-[13px] text-muted-foreground"
                  >
                    <b className="font-semibold">{title.def.name}</b>{" "}
                    <span className="text-xs">{title.def.requirement}</span>
                  </span>
                ))}
            </div>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">图鉴 · 人</h2>
          <p className="text-sm text-muted-foreground">
            你预判的从来不是「别人」，是某个具体的人 —— 那就该按人算账。
          </p>
        </div>
        {npcs.length === 0 ? (
          <EmptyState
            title="还没有人"
            description="去「记录」页签记一次与人的互动：给谁看了什么、提了什么、结果如何。"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {npcs.map((npc) => (
              <div key={npc.name} className="self-panel p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{npc.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {npc.encounters} 次
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  初见 {npc.firstMet} · 最近 {npc.lastSeen}
                </p>
                <div className="mt-2 space-y-0.5 text-[13px]">
                  {npc.proposals > 0 && (
                    <p>
                      提议 {npc.proposals} 次 · 采纳 {npc.accepted} · 拒绝{" "}
                      {npc.rejected}
                      {npc.pending > 0 && ` · 没下文 ${npc.pending}`}
                    </p>
                  )}
                  {npc.exposures > 0 && <p>给他看过 {npc.exposures} 次半成品</p>}
                </div>
                <p className="mt-2 font-mono text-xs">
                  采纳率{" "}
                  <span className="font-semibold">
                    {npc.adoptionRate === null
                      ? `样本 ${npc.accepted + npc.rejected}，暂不显示`
                      : `${npc.adoptionRate}%`}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      </TabsContent>

      <TabsContent value="attributes" className="mt-6 space-y-8">
      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">属性</h2>
          <p className="text-sm text-muted-foreground">
            九主 / 二十六子。子属性扛数值与域，主属性只做同量纲合成，跨属性永不求和。
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {panel.panel.mains.map((main) => (
            <MainCard
              key={main.key}
              main={main}
              crafts={skillTree.entries
                .filter((entry) => entry.def.main === main.key)
                .map((entry) => ({
                  name: entry.def.name,
                  reached: entry.reached,
                  unlocked: entry.unlocked,
                  total: entry.total,
                }))}
            />
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

      </section>
      </TabsContent>

      <TabsContent value="skills" className="mt-6 space-y-8">
      <section className="mb-8 space-y-3">
        <div className="self-rule">
          <h2 className="shrink-0 text-lg font-semibold">技能</h2>
        </div>
          <p className="text-sm text-muted-foreground">
            纵轴是层（元件→回路→模组→内核→印记），横轴是领域，
            每项技能自己再分入门/基础/精通/专家四级。
            点亮的唯一条件是写得出哪一次用它做成了什么。
          </p>


        <SkillTree
          entries={skillTree.entries}
          customised={skillTree.customised ?? []}
          added={skillTree.added ?? []}
        />
      </section>

      </TabsContent>


      <TabsContent value="classes" className="mt-6 space-y-8">
      <section className="mb-8 space-y-3">
        <div className="self-rule">
          <h2 className="shrink-0 text-lg font-semibold">职业</h2>
        </div>
          <p className="text-sm text-muted-foreground">
            没有「选择职业」这个动作 —— 选了就变成一句自述，而自述没有分母。
            契合度只由你点亮的节点算出来。
          </p>


        <div className="grid gap-3 lg:grid-cols-2">
          {fits.map((fit) => (
            <details key={fit.def.key} className="self-panel self-corners">
              <summary className="self-panel__head cursor-pointer">
                <span className="text-sm font-medium">{fit.def.name}</span>
                <span className="flex-1 text-[12px] text-muted-foreground">
                  {fit.def.gloss}
                </span>
                <span className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums">
                  <span
                    className="self-meter"
                    title={`${fit.def.skills.length} 门里入门了 ${fit.started} 门`}
                  >
                    {fit.def.skills.map((key, index) => (
                      <i key={key} data-on={index < fit.started ? "1" : "0"} />
                    ))}
                  </span>
                  {fit.started > 0 ? (
                    <span>
                      {fit.started}/{fit.total}
                      {fit.deep > 0 && (
                        <span className="ml-1.5 text-primary">
                          精通 {fit.deep}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">未涉足</span>
                  )}
                </span>
              </summary>

              <div className="self-panel__body space-y-2 pt-2">
                <p className="text-[12px] text-muted-foreground">
                  {fit.def.why}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
                  {fit.def.skills.map((key) => {
                    const reached = reachedBySkill.get(key) ?? 0;
                    return (
                      <span
                        key={key}
                        className={`inline-flex items-center gap-1 ${
                          reached > 0 ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`self-pip self-pip--sm ${
                            reached > 0 ? "self-pip--lit" : "self-pip--locked"
                          }`}
                        />
                        {skillNameOf(key)}
                        {reached > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            {STAGE_LABELS[reached]}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                <p className="border-t pt-2 font-mono text-[11px]">
                  <span className="self-label mr-2">印记</span>
                  <span
                    className={`inline-flex items-center gap-1 ${
                      fit.signatureLit ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`self-pip self-pip--sm ${
                        fit.signatureLit ? "self-pip--lit" : "self-pip--locked"
                      }`}
                    />
                    {skillNameOf(fit.def.signature)}
                  </span>
                </p>
                {fit.nextSkill && (
                  <p className="font-mono text-[11px] text-primary">
                    离它最近的一步：「{skillNameOf(fit.nextSkill)}」还没入门
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>

        <div className="self-panel self-corners p-4">
          <p className="self-rule mb-2">
            <span className="self-label shrink-0">远交组合</span>
          </p>
          <p className="mb-2 text-[12px] text-muted-foreground">
            比较优势不来自单项强 —— 一条线上再深，总有人比你深。
            它来自两条互不相干的线同时有深度：能同时做这两件事的人才真的少。
            这里只看结构，不编统计：除了最底下的基本功之外没有共用地基，才算两条线。
          </p>

          {crosses.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              还没有。要么走的还太浅，要么点亮的都在同一条线上 ——
              后一种更值得注意：深度会给你安全感，但比较优势是横着长出来的。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {crosses.map((cross) => (
                <li
                  key={`${cross.a.key}-${cross.b.key}`}
                  className="text-[12px]"
                >
                  <span className="font-medium">
                    {cross.a.name} × {cross.b.name}
                  </span>
                  <span className="ml-2 text-muted-foreground">{cross.why}</span>
                  {cross.classes.length > 0 && (
                    <span className="ml-2 font-mono text-[11px] text-primary">
                      两样都要：{cross.classes.map((item) => item.name).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          这十一个不是让你挑一个。它们是用来看你无意中长成了什么形状的 ——
          你多半会发现自己以为在走的那条，和实际点亮的那条不是同一条。
          印记层这辈子点亮两三个就够，点满不是目标。
        </p>
      </section>
      </TabsContent>

      <TabsContent value="traits" className="mt-6 space-y-8">
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
          <h3 className="mb-1 text-sm font-medium">扫描特性库</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            26 根互斥光谱 × 两端 = 52 条预定义特性，按面板数值自动授予与褪色。
            一根光谱同时只能持有一条 —— 稀缺来自互斥。
          </p>
          <ScanLibraryButton />
        </div>

        <div className="self-panel p-5">
          <h3 className="mb-1 text-sm font-medium">自建一条</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            库里没有的才手写。手写的标 custom，品级上限比库里的低一档。
          </p>
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

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">气质</h2>
            <p className="text-sm text-muted-foreground">
              INTP 那一类的标签。它没有分母，所以单独放 ——
              声明归声明，不进任何计算。
            </p>
          </div>

          {(() => {
            const claimedKeys = Object.keys(dispositions);
            const types = matchTypes(claimedKeys);
            if (types.length === 0) return null;
            return (
              <div className="self-panel p-4">
                <p className="self-label mb-2">组合出的类型</p>
                <div className="flex flex-wrap gap-2">
                  {types.map((type) => (
                    <span
                      key={type.def.key}
                      className={`self-card px-3 py-1.5 text-[13px] ${
                        type.complete ? "self-card--epic" : "border-dashed"
                      }`}
                      title={type.def.gloss}
                    >
                      <b>{type.def.name}</b>{" "}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {type.matched.length}/{type.def.requires.length}
                      </span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {type.def.gloss}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  类型是几条气质组合出来的，不是单独一根轴 —— MBTI 的 INTP
                  也是四根轴各取一端。它照旧全部来自声明，不进任何计算。
                </p>
              </div>
            );
          })()}

          <div className="self-panel p-4">
            <p className="self-label mb-2">AI 提名</p>
            <DispositionSuggest />
            <p className="mt-2 text-xs text-muted-foreground">
              这是整个自我页里唯一一处 AI 参与的地方 —— 能开这个口子，
              是因为气质本来就没有分母。属性、特性、档位、品级一律由代码算，
              AI 碰不到。
            </p>
          </div>

          {byAxis().map((group) => (
            <div key={group.axis} className="self-panel">
              <div className="self-panel__head">
                <span className="self-label">{group.axis}</span>
                <span className="text-sm font-medium">{group.name}</span>
              </div>
              <div className="self-panel__body">
                {group.items.map((item) => {
                  const own = dispositions[item.key];
                  const state = stateOf({
                    claimed: Boolean(own?.claimed),
                    linkedHypothesisTier: own?.tier ?? null,
                  });
                  return (
                    <div
                      key={item.key}
                      className="self-row flex flex-wrap items-baseline gap-x-2 py-2 text-[13px]"
                    >
                      <span
                        className={
                          state === "unclaimed"
                            ? "text-muted-foreground"
                            : "font-medium"
                        }
                      >
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        「{item.claim}」
                      </span>
                      {state === "declared" && (
                        <span className="self-rarity self-rarity--common">
                          声明 · 未验证
                        </span>
                      )}
                      {state === "supported" && (
                        <span className="self-rarity self-rarity--rare">
                          有证据撑着
                        </span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <DispositionToggle
                          dispositionKey={item.key}
                          claimed={Boolean(own?.claimed)}
                        />
                        {state === "declared" && !own?.tier && (
                          <PromoteDispositionButton dispositionKey={item.key} />
                        )}
                      </span>
                      {state !== "unclaimed" && (
                        <span className="w-full font-mono text-[11px] text-muted-foreground">
                          怎么验：{item.test}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </TabsContent>

      <TabsContent value="ledger" className="mt-6 space-y-8">
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
      </TabsContent>

      <TabsContent value="deeds" className="mt-6 space-y-8">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">参照类</h2>
            <p className="text-sm text-muted-foreground">
              要预想一件事要多久，可靠的做法不是想象，是看你自己过去同类的分布。
            </p>
          </div>

          {deedData.classes.length === 0 ? (
            <EmptyState
              title="还没有历史"
              description="补录二三十条 2018 年到现在的事迹，这个系统才第一次有了关于你的长期样本。"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {deedData.classes.map((cls) => {
                const prior = priorFor(cls);
                return (
                  <div key={cls.key} className="self-panel p-4">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{cls.key}</span>
                      <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                        {cls.n} 件
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      做完 {cls.done} · 放弃 {cls.abandoned} · 还在做 {cls.ongoing}
                    </p>
                    <p className="mt-2 text-[13px]">{prior.sentence}</p>
                    {cls.medianDays !== null && (
                      <p className="mt-1.5 font-mono text-[11px] text-primary">
                        下次估工期时，先把你的估计和 {Math.round(cls.medianDays)} 天比一比
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">补录</h2>
          <div className="self-panel p-5">
            <DeedForm />
          </div>
        </section>

        {deedData.deeds.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              时间线（{deedData.deeds.length} 条）
            </h2>
            <div className="self-panel px-5 py-1">
              {deedData.deeds.map((deed) => (
                <div
                  key={deed.id}
                  className="self-row flex flex-wrap items-baseline gap-x-2 py-2 text-[13px]"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {deed.occurredOn}
                  </span>
                  <span className="font-medium">{deed.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {deed.classKey}
                  </span>
                  <span className="font-mono text-[11px]">
                    {deed.outcome === "done"
                      ? "做完了"
                      : deed.outcome === "abandoned"
                        ? "放弃了"
                        : "还在做"}
                    {deed.adopted !== null &&
                      (deed.adopted ? " · 有人用" : " · 没人用")}
                    {deed.durationDays !== null && ` · ${deed.durationDays} 天`}
                  </span>
                  {deed.cost && (
                    <span className="w-full text-xs text-muted-foreground">
                      代价：{deed.cost}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </TabsContent>

      <TabsContent value="log" className="mt-6 space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">记录口</h2>
          <p className="text-sm text-muted-foreground">
            每一条都是分母的一部分。记录超过 20 秒就没人记了，所以字段刻意少。
          </p>
        </div>
        <div className="self-panel self-corners p-5">
          <h3 className="mb-1 text-sm font-medium">自述</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            这一页唯一的自由文本口。它不进任何计算 ——
            不影响属性、不参与档位、不算进任何分母。
            留着它是为了半年后回头看，以及让 AI 拆技能时知道你的处境。
          </p>
          <DeclarationForm />

          {declarations.length > 0 && (
            <ul className="mt-4 space-y-2 border-t pt-3">
              {declarations.map((item) => (
                <li key={item.id}>
                  {item.text.length > 90 ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer">
                        <span className="font-mono text-muted-foreground">
                          {item.statedOn}
                        </span>{" "}
                        {item.text.slice(0, 60)}…
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                          {item.text.length} 字
                        </span>
                      </summary>
                      <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                        {item.text}
                      </p>
                      {item.text.length > 300 && (
                        <div className="mt-1">
                          <ArchiveDeclarationControl id={item.id} />
                        </div>
                      )}
                    </details>
                  ) : (
                    <p className="text-xs">
                      <span className="font-mono text-muted-foreground">
                        {item.statedOn}
                      </span>{" "}
                      {item.text}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

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
      </TabsContent>
      </Tabs>

    </PageContainer>
  );
}
