"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { DecisionClosure } from "@/lib/domains/closures/domain";
import type { WorkbenchObjectType } from "./domain";
import { resolveWorkbenchClosure } from "./actions";

export function ClosureResultForm({
  closure,
  objectType,
  objectId,
}: {
  closure: DecisionClosure;
  objectType: WorkbenchObjectType;
  objectId: string;
}) {
  const router = useRouter();
  const [actualResult, setActualResult] = useState("");
  const [gapReason, setGapReason] =
    useState<"judgment" | "execution" | "environment_change" | "luck" | "unknown">(
      "unknown"
    );
  const [updatedRule, setUpdatedRule] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(outcome: "completed" | "not_completed") {
    setPending(true);
    setError(null);
    try {
      await resolveWorkbenchClosure({
        closureId: closure.id,
        objectType,
        objectId,
        outcome,
        actualResult,
        gapReason,
        updatedRule,
      });
      setActualResult("");
      setUpdatedRule("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "记录结果失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <textarea
        value={actualResult}
        onChange={(event) => setActualResult(event.target.value)}
        rows={3}
        placeholder="现实中实际发生了什么？"
        className="w-full rounded-md border border-orange-300 bg-white p-3 text-sm text-orange-950 outline-none"
      />
      <label className="block text-xs text-orange-900">
        差距原因
        <select
          value={gapReason}
          onChange={(event) =>
            setGapReason(event.target.value as typeof gapReason)
          }
          className="mt-1 w-full rounded-md border border-orange-300 bg-white px-3 py-2 text-sm"
        >
          <option value="judgment">判断</option>
          <option value="execution">执行</option>
          <option value="environment_change">环境变化</option>
          <option value="luck">运气</option>
          <option value="unknown">未知</option>
        </select>
      </label>
      <input
        value={updatedRule}
        onChange={(event) => setUpdatedRule(event.target.value)}
        placeholder="可选：这次学到的一条判断规则"
        className="w-full rounded-md border border-orange-300 bg-white px-3 py-2 text-sm text-orange-950 outline-none"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || !actualResult.trim()}
          onClick={() => void submit("completed")}
        >
          已完成并记录学习
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !actualResult.trim()}
          onClick={() => void submit("not_completed")}
        >
          未完成，记录原因
        </Button>
      </div>
    </div>
  );
}
