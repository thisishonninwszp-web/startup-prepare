"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Textarea } from "@/components/ui/textarea";
import { decoyFlawLabel } from "../decoy/types";
import { attack, concede, saveBattleLearned, saveFinalPosition } from "./actions";
import type { BattleMessage, BattleRecap, BattleStatus } from "./types";

export type BattleForClient = {
  id: string;
  claim: string;
  messages: BattleMessage[];
  recap: BattleRecap | null;
  final_position: string | null;
  learned: string | null;
  status: BattleStatus;
};

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败，请重试");
      }
    });
  };
  return { error, pending, run };
}

function FlawTag({ type }: { type: Parameters<typeof decoyFlawLabel>[0] }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
      {decoyFlawLabel(type)}
    </span>
  );
}

export function BattleArena({ battle }: { battle: BattleForClient }) {
  const { error, pending, run } = useAction();
  const [attackText, setAttackText] = useState("");
  const [finalPosition, setFinalPosition] = useState(battle.final_position ?? "");
  const [learned, setLearned] = useState(battle.learned ?? "");

  const lastDemon = [...battle.messages].reverse().find((m) => m.role === "demon");
  const demonIsOut = lastDemon?.out_of_excuses === true;
  // 心魔已词穷但仍是 active = 复盘那次 AI 调用失败了，提供重试。
  const recapFailed = battle.status === "active" && demonIsOut;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">主张：{battle.claim}</p>
        <Link href="/battle" className="shrink-0 text-xs text-muted-foreground hover:underline">
          ← 新的对战
        </Link>
      </div>

      {/* 对战记录 */}
      <section className="space-y-3">
        {battle.messages.map((m, i) =>
          m.role === "demon" ? (
            <div key={i} className="mr-8 rounded-lg border bg-muted/50 p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {m.out_of_excuses ? "心魔 · 词穷了" : "心魔"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="ml-8 rounded-lg border bg-card p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                你
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
            </div>
          )
        )}
      </section>

      {/* 进攻区（active 且未词穷） */}
      {battle.status === "active" && !demonIsOut && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium">你的进攻</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            点破它哪句话在骗你、为什么。打中要害它才会放弃那条借口。
          </p>
          <Textarea
            className="mt-3"
            rows={3}
            value={attackText}
            onChange={(e) => setAttackText(e.target.value)}
            placeholder="它刚才那句话的问题在于……"
            disabled={pending}
          />
          <div className="mt-3 flex justify-end gap-2">
            <ConfirmButton
              variant="outline"
              confirmLabel="收兵后不能再进攻，再点一次确认"
              disabled={pending}
              onClick={() => run(() => concede({ sessionId: battle.id }))}
            >
              收兵复盘
            </ConfirmButton>
            <Button
              disabled={pending || !attackText.trim()}
              onClick={() =>
                run(
                  () => attack({ sessionId: battle.id, attack: attackText }),
                  () => setAttackText("")
                )
              }
            >
              {pending ? "心魔接招中…" : "进攻"}
            </Button>
          </div>
        </section>
      )}

      {recapFailed && (
        <section className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">心魔已词穷，但复盘没有完成。</p>
          <div className="mt-3 flex justify-end">
            <Button disabled={pending} onClick={() => run(() => concede({ sessionId: battle.id }))}>
              {pending ? "复盘中…" : "重试复盘"}
            </Button>
          </div>
        </section>
      )}

      {/* 复盘 */}
      {battle.recap && (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-medium">复盘</h2>
          <div className="mt-4 space-y-5">
            {battle.recap.caught.length > 0 && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  你拆穿的（{battle.recap.caught.length}）
                </h3>
                <ul className="mt-2 space-y-3">
                  {battle.recap.caught.map((c, i) => (
                    <li key={i} className="rounded-md border border-status-mvp/30 bg-status-mvp/10 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p>&ldquo;{c.quote}&rdquo;</p>
                        <FlawTag type={c.type} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">你的进攻:{c.matched_attack}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {battle.recap.missed.length > 0 && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  它用了、你没点破的（{battle.recap.missed.length}）
                </h3>
                <ul className="mt-2 space-y-3">
                  {battle.recap.missed.map((m, i) => (
                    <li key={i} className="rounded-md border border-status-validating/30 bg-status-validating/10 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p>&ldquo;{m.quote}&rdquo;</p>
                        <FlawTag type={m.type} />
                      </div>
                      <p className="mt-2 text-xs">
                        <span className="text-muted-foreground">它当时怎么骗过你：</span>
                        {m.how_it_fooled_you}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {battle.recap.bonus.length > 0 && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  账本之外、你自己打出来的好问题
                </h3>
                <ul className="mt-2 space-y-3">
                  {battle.recap.bonus.map((b, i) => (
                    <li key={i} className="rounded-md border p-3 text-sm">
                      <p>{b.point}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{b.comment}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 亲笔立场（主产物）+ 学到了 */}
      {battle.status === "concluded" && (
        <>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-medium">现在，你还信这个主张吗？</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              亲笔写下你现在的立场：还信/不信/改成什么样。这是这场对战的产物。
            </p>
            <Textarea
              className="mt-3"
              rows={4}
              value={finalPosition}
              onChange={(e) => setFinalPosition(e.target.value)}
              placeholder="打完这场，我现在认为……"
              disabled={pending}
            />
            <div className="mt-3 flex justify-end">
              <Button
                disabled={
                  pending ||
                  !finalPosition.trim() ||
                  finalPosition.trim() === (battle.final_position ?? "")
                }
                onClick={() =>
                  run(() => saveFinalPosition({ sessionId: battle.id, finalPosition }))
                }
              >
                {battle.final_position ? "更新立场" : "写下立场"}
              </Button>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-medium">把这次的盲点存为&ldquo;学到了&rdquo;</h2>
            <p className="mt-1 text-xs text-muted-foreground">用你自己的话写一句。AI 不代写。</p>
            <Textarea
              className="mt-3"
              rows={2}
              value={learned}
              onChange={(e) => setLearned(e.target.value)}
              placeholder="例如：风口叙事又一次替我做了论证"
              disabled={pending}
            />
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                disabled={
                  pending || !learned.trim() || learned.trim() === (battle.learned ?? "")
                }
                onClick={() => run(() => saveBattleLearned({ sessionId: battle.id, learned }))}
              >
                {battle.learned ? "更新" : "存入学到了"}
              </Button>
            </div>
          </section>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
