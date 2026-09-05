"use client";

// 一百多项技能不能一次全铺开 —— 那不是树，是电话簿。
//
// 收束靠三件事：
//   1. 搜索 + 领域 + 状态三个筛子，随时把一百多项压到十来项；
//   2. 每层先只出图标格，点一格才展开那一项的四级；
//   3. 「现在能点的」这个筛子是默认入口 —— 大部分时候你只想看这个。

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  SKILL_GROUPS,
  SKILL_GROUP_NAMES,
  SKILL_LAYERS,
  SKILL_LAYER_GLOSS,
  SKILL_LAYER_NAMES,
  type SkillGroup,
} from "@/lib/domains/self-model/skills";
import type { SkillTreeEntry } from "@/lib/domains/self-model/nodes";
import { destinationOf } from "@/lib/domains/self-model/paths";
import { iconFor } from "./skill-icons";
import {
  ClaimEarnedControl,
  DecomposeSkillControl,
  NominateSkillsControl,
  RelockNodeControl,
  RemoveCustomSkillControl,
  UnlockNodeControl,
} from "./skill-forms";

const STAGE_LABELS = ["未开", "入门", "基础", "精通", "专家"];

type Mode = "all" | "open" | "lit";

const MODES: { key: Mode; label: string }[] = [
  { key: "open", label: "现在能点的" },
  { key: "lit", label: "已点亮的" },
  { key: "all", label: "全部" },
];

export function SkillTree({
  entries,
  customised,
  added,
}: {
  entries: SkillTreeEntry[];
  customised: string[];
  added: string[];
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<SkillGroup | "all">("all");
  const [mode, setMode] = useState<Mode>("open");
  const [selected, setSelected] = useState<string | null>(null);
  /** 刚点亮的那个节点。只用来放一次揭晓，不进任何计算。 */
  const [justLit, setJustLit] = useState<string | null>(null);

  const custom = useMemo(() => new Set(customised), [customised]);
  const mine = useMemo(() => new Set(added), [added]);
  const nameOf = useMemo(
    () => new Map(entries.map((entry) => [entry.def.key, entry.def.name])),
    [entries]
  );

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (group !== "all" && entry.def.group !== group) return false;
      if (mode === "open" && entry.next === null) return false;
      if (mode === "lit" && entry.unlocked === 0) return false;
      if (!text) return true;
      return (
        entry.def.name.includes(text) ||
        entry.def.gloss.includes(text) ||
        entry.def.key.toLowerCase().includes(text)
      );
    });
  }, [entries, query, group, mode]);

  const lit = entries.reduce((sum, entry) => sum + entry.unlocked, 0);
  const total = entries.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="space-y-3">
      <div className="self-panel self-corners space-y-2.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="找一项技能：名字或它的白话意思"
            className="h-8 min-w-[12rem] flex-1 text-[13px]"
          />
          <span className="self-meter" title={`${lit}/${total} 个小技能`}>
            {Array.from({ length: 10 }, (_, index) => (
              <i
                key={index}
                data-on={index < Math.round((lit / total) * 10) ? "1" : "0"}
              />
            ))}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {lit}/{total}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={`self-chip ${
                mode === item.key ? "self-chip--on" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => setGroup("all")}
            className={`self-chip ${group === "all" ? "self-chip--on" : ""}`}
          >
            全领域
          </button>
          {SKILL_GROUPS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setGroup(item)}
              className={`self-chip ${group === item ? "self-chip--on" : ""}`}
            >
              {SKILL_GROUP_NAMES[item]}
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            {shown.length} / {entries.length} 项
          </span>
        </div>
      </div>

      {lit === 0 && (
        <div className="self-panel self-corners space-y-2 p-4">
          <p className="self-rule">
            <span className="self-label shrink-0">先把已经会的捡回来</span>
          </p>
          <p className="text-[12px] text-muted-foreground">
            一格都没亮，多半不是因为你没做过，是因为翻起来太累 ——
            一百多个格子摆在那儿，谁也想不起自己到底做到过哪个。
            但你写过的东西还在：自述、事迹、材料箱里那几篇长的。让它去翻。
          </p>
          <ClaimEarnedControl />
        </div>
      )}

      {shown.length === 0 && (
        <p className="self-panel p-4 text-sm text-muted-foreground">
          这里空着。
          {mode === "open" &&
            "现在没有能点的，说明每一项都还卡在前面那几格上。点「全部」看看卡在哪。"}
        </p>
      )}

      {[...SKILL_LAYERS].reverse().map((layer) => {
        const rows = shown.filter((entry) => entry.def.layer === layer);
        if (rows.length === 0) return null;
        const chosen = rows.find((entry) => entry.def.key === selected) ?? null;

        return (
          <div key={layer} className="self-panel self-corners">
            <div className="self-panel__head">
              <span className="self-label">{SKILL_LAYER_NAMES[layer]}</span>
              <span className="flex-1 text-[12px] text-muted-foreground">
                {SKILL_LAYER_GLOSS[layer]}
              </span>
              <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                {rows.filter((entry) => entry.reached > 0).length}/{rows.length}
              </span>
            </div>

            <div className="self-panel__body">
              <div className="self-grid">
                {rows.map((entry) => {
                  const Icon = iconFor(entry.def.key);
                  const state =
                    entry.reached > 0
                      ? "lit"
                      : entry.next
                        ? "open"
                        : "locked";
                  return (
                    <button
                      key={entry.def.key}
                      type="button"
                      title={`${entry.def.name} —— ${entry.def.gloss}`}
                      onClick={() =>
                        setSelected((current) =>
                          current === entry.def.key ? null : entry.def.key
                        )
                      }
                      data-depth={entry.def.layer}
                      className={`self-tile self-tile--${state} ${
                        selected === entry.def.key ? "self-tile--on" : ""
                      } ${
                        justLit?.startsWith(`${entry.def.key}:`)
                          ? "animate-self-stamp"
                          : ""
                      }`}
                    >
                      <Icon className="size-5" strokeWidth={1.7} aria-hidden />
                      <span className="self-tile__name">{entry.def.name}</span>
                      <span className="self-track">
                        {entry.stages.map((stage) => (
                          <span key={stage.tier}>
                            <span
                              className={`self-pip self-pip--sm ${
                                stage.cleared
                                  ? "self-pip--lit"
                                  : stage.open
                                    ? "self-pip--open"
                                    : "self-pip--locked"
                              }`}
                            />
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>

              {chosen && (
                <div className="animate-self-reveal mt-3 border-t pt-3">
                  <SkillDetail
                    entry={chosen}
                    customised={custom.has(chosen.def.key)}
                    mine={mine.has(chosen.def.key)}
                    nameOf={nameOf}
                    justLit={justLit}
                    onLit={setJustLit}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="self-panel self-corners space-y-2 p-4">
        <p className="self-rule">
          <span className="self-label shrink-0">树上少了什么</span>
        </p>
        <p className="text-[12px] text-muted-foreground">
          「这门手艺怎么拆」你还答得上，「我到底该会哪些手艺」就难了 ——
          人本来就不知道自己不知道什么。说一个方向，它指出这棵树上缺的那几项。
          你收下它才进来，进来了照样得写下证据才点得亮。
        </p>
        <NominateSkillsControl />
      </div>
    </div>
  );
}

/**
 * 这一项通向哪里、要付什么。
 *
 * 「记录」「复述」这种名字看着只是基本功，光看名字不知道点它值不值。
 * 上半段全部由前置图算出来（改一条前置这里跟着变，不会过期），
 * 下半段是写死的代价 —— 只有利没有弊的说明，等于没说。
 */
function Destination({
  entry,
  nameOf,
}: {
  entry: SkillTreeEntry;
  nameOf: Map<string, string>;
}) {
  const dest = destinationOf(entry.def.key);
  const label = (key: string) => nameOf.get(key) ?? key;

  return (
    <div className="space-y-1 border-l-2 border-border pl-3">
      {dest.next.length > 0 && (
        <p className="font-mono text-[11px]">
          <span className="self-label mr-1.5">往上</span>
          {dest.next.map((def) => label(def.key)).join(" · ")}
        </p>
      )}

      {dest.signatures.length > 0 && (
        <p className="font-mono text-[11px]">
          <span className="self-label mr-1.5">最后到</span>
          {dest.signatures.map((def) => label(def.key)).join(" · ")}
        </p>
      )}

      {dest.classes.length > 0 && (
        <p className="font-mono text-[11px] text-muted-foreground">
          <span className="self-label mr-1.5">经过它的路</span>
          {dest.classes.map((item) => item.name).join(" · ")}
          {dest.gateFor.length > 0 && (
            <span className="ml-1.5 text-primary">
              （{dest.gateFor.map((item) => item.name).join(" · ")}的必经之路）
            </span>
          )}
        </p>
      )}

      {entry.def.cost && (
        <p className="text-[12px]">
          <span className="self-label mr-1.5">代价</span>
          <span className="text-muted-foreground">{entry.def.cost}</span>
        </p>
      )}
    </div>
  );
}

function SkillDetail({
  entry,
  customised,
  mine,
  nameOf,
  justLit,
  onLit,
}: {
  entry: SkillTreeEntry;
  customised: boolean;
  mine: boolean;
  nameOf: Map<string, string>;
  justLit: string | null;
  onLit: (key: string) => void;
}) {
  const Icon = iconFor(entry.def.key);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-5 text-primary" strokeWidth={1.7} aria-hidden />
        <span className="text-sm font-semibold">{entry.def.name}</span>
        <span className="text-[12px] text-muted-foreground">
          {entry.def.gloss}
        </span>
        <span className="ml-auto font-mono text-[11px] tabular-nums">
          {STAGE_LABELS[entry.reached]} {entry.unlocked}/{entry.total}
        </span>
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">
        {SKILL_GROUP_NAMES[entry.def.group]}
        {(entry.def.requires ?? []).length > 0 && (
          <>
            {" ← 前置 "}
            {(entry.def.requires ?? [])
              .map((key) => nameOf.get(key) ?? key)
              .join(" · ")}
          </>
        )}
      </p>

      <Destination entry={entry} nameOf={nameOf} />

      {justLit?.startsWith(`${entry.def.key}:`) && (
        <p className="animate-self-reveal font-mono text-[11px] text-primary">
          ▸ 点亮了。这一格从现在起有据可查。
        </p>
      )}

      {entry.rough && (
        <p className="font-mono text-[11px] text-muted-foreground">
          这项还没拆成小技能，先按三档粗着走。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DecomposeSkillControl
          skillKey={entry.def.key}
          skillName={entry.def.name}
          customised={customised}
        />
        {mine && <RemoveCustomSkillControl skillKey={entry.def.key} />}
      </div>

      {entry.stages.map((stage) => (
        <div key={stage.tier}>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="self-label">{stage.name}</span>
            {stage.standard && (
              <span className="text-[12px]">{stage.standard}</span>
            )}
            {stage.blockedBy && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {stage.blockedBy}
              </span>
            )}
          </p>
          <ul className="mt-1 space-y-1">
            {stage.nodes.map((item) => (
              <li
                key={item.node.key}
                className={`flex flex-wrap items-start gap-2 rounded-md px-1 text-[12px] ${
                  justLit === item.node.key ? "animate-self-rowflash" : ""
                }`}
              >
                <span
                  className={`self-pip self-pip--sm mt-1 ${
                    item.unlocked
                      ? "self-pip--lit"
                      : item.available
                        ? "self-pip--open"
                        : "self-pip--locked"
                  } ${
                    justLit === item.node.key ? "animate-self-lightup" : ""
                  }`}
                />
                <span className="min-w-[6rem] font-medium">
                  {item.node.name}
                </span>
                <span className="flex-1 text-muted-foreground">
                  {item.node.test}
                </span>
                {item.unlocked ? (
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {item.unlockedOn} · {item.proof}
                    </span>
                    <RelockNodeControl nodeKey={item.node.key} />
                  </span>
                ) : item.available ? (
                  <UnlockNodeControl
                    nodeKey={item.node.key}
                    nodeName={item.node.name}
                    test={item.node.test}
                    onLit={onLit}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
