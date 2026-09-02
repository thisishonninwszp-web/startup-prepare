"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SKILL_DEFS,
  SKILL_GROUPS,
  SKILL_GROUP_NAMES,
} from "@/lib/domains/self-model/skills";
import {
  acceptNomination,
  acceptSkillStages,
  proposeSkillStages,
  resetSkillStages,
  claimDisposition,
  createCharacter,
  promoteDisposition,
  relockSkillNode,
  recordDeed,
  rollCallQuests,
  settleSkills,
  suggestDispositions,
  syncLibraryTraits,
  unlockSkillNode,
  takeFeat,
  tickSkill,
} from "./actions";

function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>, onDone?: () => void) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        onDone?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败");
      }
    });
  };
  return { pending, error, run };
}

/**
 * 建卡：45 项技能逐个给一个起始值。只能做一次。
 * 逐项过一遍那些名字本身就是一次自我认识 —— 「求助」那一行填几分，
 * 比任何性格测试的结果都直接。
 */
export function CharacterCreationForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [passions, setPassions] = useState<Record<string, number>>({});
  const { pending, error, run } = useAction();

  const filled = SKILL_DEFS.filter(
    (def) => (values[def.key] ?? "").trim().length > 0
  ).length;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          createCharacter(
            SKILL_DEFS.map((def) => ({
              key: def.key,
              value: Number(values[def.key] ?? 0),
              passion: passions[def.key] ?? 0,
            }))
          )
        );
      }}
    >
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          给每项一个 0–100 的起始值，凭直觉，不用纠结。
          <b className="text-foreground">
            {" "}
            这是唯一一次可以直接写数字的机会
          </b>
          —— 建完卡之后，技能只能靠「实际用过并且有结果」打勾涨。
        </p>
        <p className="text-sm text-muted-foreground">
          🔥 是「没人要求你也会做」的程度，点一下切换 0 → 1 → 2。
        </p>
      </div>

      {SKILL_GROUPS.map((group) => (
        <div key={group} className="space-y-1.5">
          <p className="self-label">{SKILL_GROUP_NAMES[group]}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SKILL_DEFS.filter((def) => def.group === group).map((def) => (
              <div key={def.key} className="flex items-center gap-2">
                <Label
                  htmlFor={`skill-${def.key}`}
                  className="flex-1 cursor-help truncate decoration-dotted underline-offset-4 hover:underline"
                  title={`${def.name} —— ${def.gloss}`}
                >
                  {def.name}
                </Label>
                <Input
                  id={`skill-${def.key}`}
                  type="number"
                  min={0}
                  max={100}
                  value={values[def.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [def.key]: event.target.value,
                    }))
                  }
                  className="w-16"
                  placeholder="0"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-12 shrink-0"
                  onClick={() =>
                    setPassions((current) => ({
                      ...current,
                      [def.key]: ((current[def.key] ?? 0) + 1) % 3,
                    }))
                  }
                >
                  {"🔥".repeat(passions[def.key] ?? 0) || "—"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Err message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmButton
          type="submit"
          disabled={pending}
          confirmLabel="再点一次：建卡不可重来"
        >
          {pending ? "建卡中…" : "完成建卡"}
        </ConfirmButton>
        <span className="font-mono text-xs text-muted-foreground">
          已填 {filled}/{SKILL_DEFS.length}（留空按 0 算）
        </span>
      </div>
    </form>
  );
}

export function TickControl({
  skillKey,
  skillName,
}: {
  skillKey: string;
  skillName: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        打勾
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={`「${skillName}」这次用在哪、结果是什么`}
      />
      <p className="text-xs text-muted-foreground">
        说不出用在哪的勾就是没用过。看教程、读书、想明白了，都不算。
      </p>
      <Err message={error} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !note.trim()}
          onClick={() =>
            run(() => tickSkill({ key: skillKey, note }), () => {
              setNote("");
              setOpen(false);
            })
          }
        >
          用过，有结果
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </div>
  );
}

export function SettleSkillsButton({ pendingTicks }: { pendingTicks: number }) {
  const [changes, setChanges] = useState<string[] | null>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-2">
      <ConfirmButton
        variant="outline"
        disabled={pending || pendingTicks === 0}
        onClick={() =>
          run(async () => {
            setChanges(await settleSkills());
          })
        }
      >
        {pendingTicks === 0
          ? "没有待结算的勾"
          : `结算 ${pendingTicks} 个勾`}
      </ConfirmButton>
      <Err message={error} />
      {changes && (
        <ul className="space-y-0.5 font-mono text-xs">
          {changes.length === 0 ? (
            <li className="animate-self-reveal text-muted-foreground">
              这一轮没有技能变化
            </li>
          ) : (
            changes.map((line, index) => (
              <li
                key={line}
                className="animate-self-reveal"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                {line}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function TakeFeatButton({
  featKey,
  disabled,
}: {
  featKey: string;
  disabled: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-1">
      <ConfirmButton
        size="sm"
        disabled={pending || disabled}
        onClick={() => run(() => takeFeat(featKey))}
      >
        花 1 点点上
      </ConfirmButton>
      <Err message={error} />
    </div>
  );
}

/**
 * 扫一遍特性库。平时不自动跑，攒着一次性揭晓 ——
 * 实时刷新的数字没人看第二眼，开箱才有那一下。
 */
export function ScanLibraryButton() {
  const [result, setResult] = useState<{
    granted: string[];
    faded: string[];
  } | null>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(async () => {
            setResult(await syncLibraryTraits());
          })
        }
      >
        {pending ? "扫描中…" : "扫描特性库"}
      </Button>
      <Err message={error} />
      {result && (
        <div className="space-y-1 text-sm">
          {result.granted.length === 0 && result.faded.length === 0 && (
            <p className="animate-self-reveal text-muted-foreground">
              这一轮没有变化。数值还在常人区，或者样本不够 —— 空着才是常态。
            </p>
          )}
          {result.granted.map((line, index) => (
            <p
              key={line}
              className="animate-self-reveal self-card animate-self-sheen px-3 py-1.5"
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <span className="animate-self-stamp mr-1.5 inline-block font-mono text-[10px] font-bold tracking-[0.12em] text-primary">
                解锁
              </span>
              {line}
            </p>
          ))}
          {result.faded.map((line, index) => (
            <p
              key={line}
              className="animate-self-reveal text-muted-foreground"
              style={{
                animationDelay: `${(result.granted.length + index) * 90}ms`,
              }}
            >
              褪色 {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 页面挂载后点一次名，把这一周出现过的怪记上。
 * 放在客户端而不是渲染时：渲染时写库会在每次预取、每次刷新时重复触发。
 */
export function QuestRollCall({
  quests,
}: {
  quests: { id: string; tier: "trash" | "elite" | "boss"; name: string }[];
}) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || quests.length === 0) return;
    done.current = true;
    void rollCallQuests(quests);
  }, [quests]);
  return null;
}

const DEED_CLASSES = [
  "自发项目",
  "外部委托",
  "学一门新手艺",
  "换环境",
  "开口求助",
  "身体计划",
];

/**
 * 补录一条事迹。
 * 参照类必填 —— 进不了任何参照类的事迹对基准率没有贡献，那它只是回忆。
 */
export function DeedForm() {
  const [title, setTitle] = useState("");
  const [classKey, setClassKey] = useState(DEED_CLASSES[0]);
  const [occurredOn, setOccurredOn] = useState("");
  const [outcome, setOutcome] = useState<"done" | "abandoned" | "ongoing">(
    "done"
  );
  const [adopted, setAdopted] = useState<"yes" | "no" | "na">("na");
  const [durationDays, setDurationDays] = useState("");
  const [cost, setCost] = useState("");
  const { pending, error, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            recordDeed({
              title,
              classKey,
              occurredOn,
              outcome,
              adopted:
                adopted === "na" ? null : adopted === "yes" ? true : false,
              durationDays: durationDays.trim() ? Number(durationDays) : null,
              cost,
            }),
          () => {
            setTitle("");
            setDurationDays("");
            setCost("");
          }
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deed-title">这件事叫什么</Label>
          <Input
            id="deed-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="社長之旅 / 砍掉那部分广告"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deed-date">什么时候（旧事填到月初就行）</Label>
          <Input
            id="deed-date"
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>参照类</Label>
        <div className="flex flex-wrap gap-1.5">
          {DEED_CLASSES.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={classKey === item ? "default" : "outline"}
              onClick={() => setClassKey(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <Input
          value={classKey}
          onChange={(event) => setClassKey(event.target.value)}
          placeholder="或者自己写一类"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>结果</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["done", "做完了"],
                ["abandoned", "放弃了"],
                ["ongoing", "还在做"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={outcome === value ? "default" : "outline"}
                onClick={() => setOutcome(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>有人用吗</Label>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["yes", "有"],
                ["no", "没有"],
                ["na", "不适用"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={adopted === value ? "default" : "outline"}
                onClick={() => setAdopted(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deed-days">花了多少天</Label>
          <Input
            id="deed-days"
            type="number"
            min={0}
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            placeholder="估个数就行"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deed-cost">付出/放弃了什么（可空）</Label>
        <Input
          id="deed-cost"
          value={cost}
          onChange={(event) => setCost(event.target.value)}
          placeholder="推掉了什么、少赚了多少、得罪了谁"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        「结果 / 有人用 / 花了多久」这三项决定了基准率能不能算出来。
        答不上这三项的事迹，进不了参照类。
      </p>

      <Err message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "记录中…" : "补录一条"}
      </Button>
    </form>
  );
}

export function DispositionToggle({
  dispositionKey,
  claimed,
}: {
  dispositionKey: string;
  claimed: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={claimed ? "default" : "outline"}
        disabled={pending}
        onClick={() => run(() => claimDisposition(dispositionKey))}
      >
        {claimed ? "✓ 像我" : "像我"}
      </Button>
      <Err message={error} />
    </>
  );
}

export function PromoteDispositionButton({
  dispositionKey,
}: {
  dispositionKey: string;
}) {
  const { pending, error, run } = useAction();
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => promoteDisposition(dispositionKey))}
      >
        立成假设去验
      </Button>
      <Err message={error} />
    </>
  );
}

type Nomination = { name: string; axis: string; claim: string; test: string; because: string };

/**
 * AI 提名的气质。提名一律是候选 —— 不写库，点了「收下」才算数。
 */
export function DispositionSuggest() {
  const [items, setItems] = useState<Nomination[] | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              setItems(await suggestDispositions());
            })
          }
        >
          {pending ? "想中…" : "让 AI 提几条我可能漏掉的"}
        </Button>
        <span className="text-xs text-muted-foreground">
          提名一律是候选，点「收下」才进你的档案
        </span>
      </div>
      <Err message={error} />

      {items && items.length === 0 && (
        <p className="animate-self-reveal text-sm text-muted-foreground">
          这一轮没提出新的。已认领的那些已经覆盖了它想到的角度。
        </p>
      )}

      {items?.map((item, index) => (
        <div
          key={item.name}
          className="animate-self-reveal self-panel p-4"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground">「{item.claim}」</span>
            <span className="self-rarity self-rarity--common ml-auto">
              AI 提名 · 候选
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            怎么验：{item.test}
          </p>
          {item.because && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              为什么提：{item.because}
            </p>
          )}
          <div className="mt-2">
            {taken.includes(item.name) ? (
              <span className="font-mono text-[11px] text-primary">已收下</span>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      acceptNomination({
                        name: item.name,
                        claim: item.claim,
                        test: item.test,
                      }),
                    () => setTaken((current) => [...current, item.name])
                  )
                }
              >
                收下
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


type DraftNode = { name: string; test: string; keep: boolean };
type DraftStage = { tier: number; name: string; standard: string; nodes: DraftNode[] };

/**
 * 让 AI 把一项技能拆成四级小技能。
 *
 * 这一处放 AI 进来，是因为「要成为这个领域的专家，需要掌握哪些小技能」
 * 本来就是用户没有的知识量。但它给的只是一张待办清单：
 * 提名不写库，逐条改过、收下的才存；哪一格亮仍然只由 proof 决定。
 */
export function DecomposeSkillControl({
  skillKey,
  skillName,
  customised,
}: {
  skillKey: string;
  skillName: string;
  customised: boolean;
}) {
  const [draft, setDraft] = useState<DraftStage[] | null>(null);
  const { pending, error, run } = useAction();

  const edit = (tier: number, index: number, patch: Partial<DraftNode>) =>
    setDraft((current) =>
      current?.map((stage) =>
        stage.tier === tier
          ? {
              ...stage,
              nodes: stage.nodes.map((node, position) =>
                position === index ? { ...node, ...patch } : node
              ),
            }
          : stage
      ) ?? null
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const stages = await proposeSkillStages(skillKey);
              setDraft(
                stages.map((stage) => ({
                  tier: stage.tier,
                  name: stage.name,
                  standard: stage.standard,
                  nodes: stage.nodes.map((node) => ({ ...node, keep: true })),
                }))
              );
            })
          }
        >
          {pending ? "拆中…" : customised ? "重新拆一次" : "让 AI 拆开它"}
        </Button>
        {customised && (
          <ConfirmButton
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => resetSkillStages(skillKey))}
          >
            退回默认拆解
          </ConfirmButton>
        )}
        <span className="text-[11px] text-muted-foreground">
          提名一律是候选，改过、收下才算数
        </span>
      </div>
      <Err message={error} />

      {draft && draft.length === 0 && (
        <p className="text-sm text-muted-foreground">
          这一轮没拆出四级齐全的结果。缺级的整份作废 ——
          半棵树会让你卡在中间。再试一次。
        </p>
      )}

      {draft && draft.length > 0 && (
        <div className="animate-self-reveal space-y-3 border-l-2 border-primary/40 pl-3">
          {draft.map((stage) => (
            <div key={stage.tier}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="self-label">{stage.name}</span>
                <Input
                  value={stage.standard}
                  className="h-7 flex-1 text-[12px]"
                  onChange={(event) =>
                    setDraft(
                      (current) =>
                        current?.map((item) =>
                          item.tier === stage.tier
                            ? { ...item, standard: event.target.value }
                            : item
                        ) ?? null
                    )
                  }
                />
              </div>
              <ul className="mt-1 space-y-1">
                {stage.nodes.map((node, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={node.keep}
                      aria-label={`留下 ${node.name}`}
                      onChange={(event) =>
                        edit(stage.tier, index, { keep: event.target.checked })
                      }
                    />
                    <Input
                      value={node.name}
                      className="h-7 w-28 text-[12px]"
                      onChange={(event) =>
                        edit(stage.tier, index, { name: event.target.value })
                      }
                    />
                    <Input
                      value={node.test}
                      className="h-7 flex-1 text-[12px]"
                      onChange={(event) =>
                        edit(stage.tier, index, { test: event.target.value })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    acceptSkillStages({
                      skillKey,
                      stages: draft.map((stage) => ({
                        tier: stage.tier,
                        standard: stage.standard,
                        nodes: stage.nodes
                          .filter((node) => node.keep)
                          .map((node) => ({
                            name: node.name,
                            test: node.test,
                          })),
                      })),
                    }),
                  () => setDraft(null)
                )
              }
            >
              收下这份拆解
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              丢掉
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            收下之后「{skillName}」按这份走。已经点亮的节点不会因为换树而消失。
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 点亮一个技能节点。必须写下证据 ——
 * 写不出"什么时候、用它做成了什么"，这个节点就不该亮。
 */
export function UnlockNodeControl({
  nodeKey,
  nodeName,
  test,
}: {
  nodeKey: string;
  nodeName: string;
  test: string;
}) {
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState("");
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        点亮
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground">
        判据：{test}
      </p>
      <Input
        value={proof}
        onChange={(event) => setProof(event.target.value)}
        placeholder={`「${nodeName}」什么时候、用它做成了什么`}
      />
      <p className="text-xs text-muted-foreground">
        写不出这一句就先别点。看教程、读书、想明白了，都不算。
      </p>
      <Err message={error} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !proof.trim()}
          onClick={() =>
            run(() => unlockSkillNode({ nodeKey, proof }), () => {
              setProof("");
              setOpen(false);
            })
          }
        >
          我做到过
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </div>
  );
}

export function RelockNodeControl({ nodeKey }: { nodeKey: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <ConfirmButton
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => relockSkillNode(nodeKey))}
      >
        熄掉
      </ConfirmButton>
      <Err message={error} />
    </>
  );
}
