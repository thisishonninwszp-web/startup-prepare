"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  completeRetroCommitment,
  prepareRetroPeriod,
  resolveRetroPrediction,
} from "./actions";

type DuePrediction = {
  id: string;
  period_id: string;
  text: string;
  due_at: string;
  outcome: string;
};

type OpenCommitment = {
  id: string;
  period_id: string;
  text: string;
  due_at: string | null;
  completed_at: string | null;
  note: string | null;
};

export function RetroHomeActions({
  period,
  type,
  start,
  end,
  duePredictions,
  openCommitments,
}: {
  period?: { id: string; status: string };
  type?: "weekly" | "monthly";
  start?: string;
  end?: string;
  duePredictions?: DuePrediction[];
  openCommitments?: OpenCommitment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (duePredictions) {
    return (
      <div className="mt-4 space-y-3">
        {duePredictions.map((prediction) => (
          <div
            key={prediction.id}
            className="flex flex-col gap-3 rounded-md border border-status-validating/30 bg-white p-3 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 text-sm">{prediction.text}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy === prediction.id}
                onClick={async () => {
                  setBusy(prediction.id);
                  try {
                    await resolveRetroPrediction(prediction.id, "hit", "");
                    router.refresh();
                  } catch (caught) {
                    console.error("对账复盘预测失败", caught);
                    setError(caught instanceof Error ? caught.message : "对账失败");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Check className="mr-1 size-3" />
                命中
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy === prediction.id}
                onClick={async () => {
                  setBusy(prediction.id);
                  try {
                    await resolveRetroPrediction(prediction.id, "miss", "");
                    router.refresh();
                  } catch (caught) {
                    console.error("对账复盘预测失败", caught);
                    setError(caught instanceof Error ? caught.message : "对账失败");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <X className="mr-1 size-3" />
                没命中
              </Button>
            </div>
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (openCommitments) {
    return (
      <div className="mt-4 space-y-2">
        {openCommitments.map((commitment) => (
          <div
            key={commitment.id}
            className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 text-sm">{commitment.text}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy === commitment.id}
              onClick={async () => {
                setBusy(commitment.id);
                setError(null);
                try {
                  await completeRetroCommitment(commitment.id, "");
                  router.refresh();
                } catch (caught) {
                  console.error("完成复盘行动失败", caught);
                  setError(caught instanceof Error ? caught.message : "更新失败");
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Check className="mr-1 size-3" />
              已完成
            </Button>
          </div>
        ))}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (!type || !start || !end) return null;
  if (period) {
    return (
      <Link
        href={`/retrospectives/${type}/${period.id}`}
        className="mt-5 inline-flex items-center gap-2 text-sm font-medium"
      >
        {period.status === "completed" ? "查看已完成复盘" : "继续复盘"}
        <ArrowRight className="size-4" />
      </Link>
    );
  }
  return (
    <div className="mt-5">
      <Button
        type="button"
        variant="outline"
        disabled={busy === type}
        onClick={async () => {
          setBusy(type);
          setError(null);
          try {
            const id = await prepareRetroPeriod(type, start, end);
            router.push(`/retrospectives/${type}/${id}`);
          } catch (caught) {
            console.error("准备周期复盘失败", caught);
            setError(caught instanceof Error ? caught.message : "准备复盘失败");
          } finally {
            setBusy(null);
          }
        }}
      >
        准备{type === "weekly" ? "周" : "月"}复盘
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
