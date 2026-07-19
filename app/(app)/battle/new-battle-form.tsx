"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createBattle } from "./actions";

export function NewBattleForm({ ideaId }: { ideaId: string | null }) {
  const router = useRouter();
  const [claim, setClaim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium">你心里想信的主张是什么？</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        越是让你心动的想法越值得拿来打。心魔会先替你护盘。
      </p>
      <Textarea
        className="mt-3"
        rows={3}
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder="例如：我这个产品只要做出来就会有人付费"
        disabled={pending}
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex justify-end">
        <Button
          disabled={pending || !claim.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const { sessionId } = await createBattle({ claim, ideaId });
                router.push(`/battle?session=${sessionId}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "开局失败，请重试");
              }
            });
          }}
        >
          {pending ? "心魔正在开盘…" : "开战"}
        </Button>
      </div>
    </section>
  );
}
