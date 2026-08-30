"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SKILL_DEFS,
  SKILL_GROUPS,
  SKILL_GROUP_NAMES,
} from "@/lib/domains/self-model/skills";
import { createCharacter, settleSkills, takeFeat, tickSkill } from "./actions";

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
