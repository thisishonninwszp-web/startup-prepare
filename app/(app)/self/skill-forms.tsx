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
  createCharacter,
  recordDeed,
  rollCallQuests,
  settleSkills,
  syncLibraryTraits,
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
                <Label htmlFor={`skill-${def.key}`} className="flex-1 truncate">
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
            <li className="text-muted-foreground">这一轮没有技能变化</li>
          ) : (
            changes.map((line) => <li key={line}>{line}</li>)
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
            <p className="text-muted-foreground">
              这一轮没有变化。数值还在常人区，或者样本不够 —— 空着才是常态。
            </p>
          )}
          {result.granted.map((line) => (
            <p key={line}>
              <span className="text-primary">解锁</span> {line}
            </p>
          ))}
          {result.faded.map((line) => (
            <p key={line} className="text-muted-foreground">
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
