"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptNomination,
  acceptSkill,
  acceptSkillStages,
  proposeSkillStages,
  proposeSkills,
  removeCustomSkill,
  resetSkillStages,
  claimDisposition,
  promoteDisposition,
  relockSkillNode,
  recordDeed,
  rollCallQuests,
  suggestDispositions,
  syncLibraryTraits,
  unlockSkillNode,
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


type SkillCandidate = {
  key: string;
  name: string;
  gloss: string;
  group: string;
  main: string;
  layer: string;
  requires: string[];
  milestones: { name: string; test: string }[];
  because: string;
};

const LAYER_LABELS: Record<string, string> = {
  component: "元件",
  circuit: "回路",
  module: "模组",
  core: "内核",
  signature: "印记",
};

/**
 * 让 AI 指出树上缺的技能。
 *
 * 「我该会哪些手艺」比「这门手艺怎么拆」更靠前，也更说不出口 ——
 * 一个人本来就不知道自己不知道什么。但提名仍然只是候选：
 * 收下才进树，进了树也一样要写 proof 才能点亮。
 */
export function NominateSkillsControl() {
  const [direction, setDirection] = useState("");
  const [items, setItems] = useState<SkillCandidate[] | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const { pending, error, run } = useAction();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          placeholder="你想往哪走？例：往经营层的 officer 方向"
          className="h-8 min-w-[14rem] flex-1 text-[13px]"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !direction.trim()}
          onClick={() =>
            run(async () => {
              setItems(await proposeSkills(direction));
            })
          }
        >
          {pending ? "想中…" : "看看树上少了什么"}
        </Button>
      </div>
      <Err message={error} />

      {items && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          这一轮没提出能用的。要么方向太泛，要么它提的都被闸门挡掉了 ——
          名字不是词、前置不存在、或者三档标准写不出能判真假的。换个更具体的方向再试。
        </p>
      )}

      {items?.map((item) => (
        <div key={item.key} className="animate-self-reveal self-panel p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{item.name}</span>
            <span className="self-label">
              {LAYER_LABELS[item.layer] ?? item.layer} · {item.main}
            </span>
            <span className="text-xs text-muted-foreground">{item.gloss}</span>
            <span className="self-rarity self-rarity--common ml-auto">
              AI 提名 · 候选
            </span>
          </div>

          {item.requires.length > 0 && (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              建在：{item.requires.join(" · ")}
            </p>
          )}
          {item.because && (
            <p className="mt-1 text-xs text-muted-foreground">
              为什么缺它：{item.because}
            </p>
          )}

          <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
            {item.milestones.map((milestone) => (
              <li key={milestone.name}>
                <span className="font-semibold">{milestone.name}</span>{" "}
                <span className="text-muted-foreground">{milestone.test}</span>
              </li>
            ))}
          </ul>

          <div className="mt-2">
            {taken.includes(item.key) ? (
              <span className="font-mono text-[11px] text-primary">
                已接进树里
              </span>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => acceptSkill(item),
                    () => setTaken((current) => [...current, item.key])
                  )
                }
              >
                收进树里
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 加错了可以摘掉。 */
export function RemoveCustomSkillControl({ skillKey }: { skillKey: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <ConfirmButton
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => removeCustomSkill(skillKey))}
      >
        从树上摘掉
      </ConfirmButton>
      <Err message={error} />
    </>
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
