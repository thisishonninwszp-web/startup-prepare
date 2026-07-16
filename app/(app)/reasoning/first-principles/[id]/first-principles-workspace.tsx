"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { markNodeVerified } from "@/app/(app)/reasoning/actions";
import type {
  FirstPrinciplesNode,
  FirstPrinciplesSessionWithNodes,
  NodeBasisType,
} from "@/app/(app)/reasoning/types";

// ── Basis type metadata ───────────────────────────────────────────────────────

const BASIS_META: Record<
  NodeBasisType,
  { label: string; badgeClass: string; dotClass: string }
> = {
  bedrock: {
    label: "基础事实",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    dotClass: "bg-green-500",
  },
  data_backed: {
    label: "有数据支撑",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  personal_experience: {
    label: "个人经验",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    dotClass: "bg-yellow-500",
  },
  industry_consensus: {
    label: "行业共识",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    dotClass: "bg-orange-500",
  },
  media_narrative: {
    label: "媒体叙事",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    dotClass: "bg-red-400",
  },
  pure_assumption: {
    label: "纯假设",
    badgeClass: "bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200",
    dotClass: "bg-red-600",
  },
};

const DEPTH_LABELS: Record<number, string> = {
  1: "直接子命题",
  2: "支撑层",
  3: "基础层",
};

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  isWeak,
}: {
  node: FirstPrinciplesNode;
  isWeak: boolean;
}) {
  const [verified, setVerified] = useState(node.is_verified);
  const [showChallenge, setShowChallenge] = useState(false);
  const [pending, startTransition] = useTransition();
  const meta = BASIS_META[node.basis_type];

  function toggleVerified() {
    const next = !verified;
    setVerified(next);
    startTransition(async () => {
      try {
        await markNodeVerified(node.id, next);
      } catch {
        setVerified(!next);
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-4 space-y-2.5 transition-opacity ${
        verified ? "opacity-60" : ""
      } ${isWeak ? "border-red-300 dark:border-red-700" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badgeClass}`}
          >
            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
            {meta.label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {DEPTH_LABELS[node.depth] ?? `深度 ${node.depth}`}
          </span>
          {isWeak && (
            <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
              ⚠ 脆弱环节
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggleVerified}
          disabled={pending}
          title={verified ? "取消验证标记" : "标记为已验证"}
          className={`shrink-0 h-4 w-4 rounded border transition-colors ${
            verified
              ? "border-green-500 bg-green-500 text-white"
              : "border-border hover:border-foreground/40"
          } flex items-center justify-center text-[10px]`}
        >
          {verified ? "✓" : ""}
        </button>
      </div>

      <p className="text-sm font-medium leading-relaxed">{node.claim}</p>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {node.basis_note}
      </p>

      <button
        type="button"
        onClick={() => setShowChallenge((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <span>{showChallenge ? "▾" : "▸"}</span>
        证伪问题
      </button>

      {showChallenge && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-foreground leading-relaxed">
          {node.challenge}
        </div>
      )}
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────

export function FirstPrinciplesWorkspace({
  session,
}: {
  session: FirstPrinciplesSessionWithNodes;
}) {
  const weakSet = new Set(session.weakest_links);

  const nodesByDepth: Record<number, FirstPrinciplesNode[]> = { 1: [], 2: [], 3: [] };
  for (const n of session.nodes) {
    (nodesByDepth[n.depth] ?? (nodesByDepth[n.depth] = [])).push(n);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Link href="/reasoning" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">第一性原理分解</h1>
          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
            {session.original_claim}
          </p>
        </div>
      </div>

      {/* 原信念 vs. AI 重述 */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            你的原始表述
          </p>
          <p className="text-sm leading-relaxed">{session.original_claim}</p>
        </div>
        <div className="rounded-lg border border-foreground/20 bg-card p-4 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            AI 精确重述
          </p>
          <p className="text-sm leading-relaxed">{session.restated_belief}</p>
        </div>
      </div>

      {/* 脆弱环节警示 */}
      {session.weakest_links.length > 0 && (
        <div className="mb-8 rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/20 p-4 space-y-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            ⚠ 最脆弱的环节（优先验证这些）
          </p>
          <ul className="space-y-1">
            {session.weakest_links.map((link, i) => (
              <li key={i} className="text-sm text-red-800 dark:text-red-300 leading-relaxed">
                · {link}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 命题卡片（按层级） */}
      {([1, 2, 3] as const).map((depth) => {
        const nodes = nodesByDepth[depth] ?? [];
        if (nodes.length === 0) return null;
        return (
          <div key={depth} className="mb-8 space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {DEPTH_LABELS[depth]}
            </h2>
            {nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isWeak={weakSet.has(node.claim)}
              />
            ))}
          </div>
        );
      })}

      {/* 基石总结 */}
      <div className="rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/20 p-4 space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-green-700 dark:text-green-400">
          真正站得住脚的部分
        </p>
        <p className="text-sm text-green-800 dark:text-green-300 leading-relaxed">
          {session.bedrock_summary}
        </p>
      </div>

      {/* 图例 */}
      <div className="mt-8 border-t pt-6">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          证据基础图例
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(BASIS_META) as [NodeBasisType, typeof BASIS_META[NodeBasisType]][]).map(
            ([type, m]) => (
              <span
                key={type}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${m.badgeClass}`}
              >
                <span className={`mr-1 h-1.5 w-1.5 rounded-full ${m.dotClass}`} />
                {m.label}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
