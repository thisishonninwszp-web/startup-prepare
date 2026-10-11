"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  childrenOf,
  evidenceRatio,
  formatPercent,
  LIKELIHOOD_FILLED,
  LIKELIHOOD_LABELS,
  MAX_INFERENCE_DEPTH,
  posterior,
  STANCE_LABELS,
  type InferenceEvidence,
  type InferenceLikelihood,
  type InferenceNode,
} from "@/lib/domains/signals/inference-shared";
import { nodeBetQuestion } from "@/lib/domains/signals/practice-shared";
import { expandInferenceAction } from "./actions";
import { BayesPanel } from "./bayes-panel";
import { JudgmentForm } from "./judgment-forms";

/** 五格，填满几格就是几档。扫一眼就能比，不用读字。 */
export function LikelihoodMeter({ likelihood, unsure }: { likelihood: InferenceLikelihood; unsure?: boolean }) {
  const filled = LIKELIHOOD_FILLED[likelihood];
  return (
    <span className="inline-flex items-center gap-1.5" title={LIKELIHOOD_LABELS[likelihood]}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={"inline-block h-2.5 w-2.5 rounded-sm " + (i < filled ? "bg-foreground/70" : "bg-muted")}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {LIKELIHOOD_LABELS[likelihood]}
        {unsure ? " · 裁判也拿不准" : ""}
      </span>
    </span>
  );
}

/** 上网查到的事实：默认收起，标题上就写着支持几条、反对几条。 */
function EvidenceList({ evidence }: { evidence: InferenceEvidence[] }) {
  const count = (stance: InferenceEvidence["stance"]) => evidence.filter((e) => e.stance === stance).length;
  return (
    <details className="mt-1 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        查到的证据：支持 {count("supports")} · 反对 {count("contradicts")} · 背景 {count("context")}
      </summary>
      <ul className="mt-2 space-y-3 border-l-2 border-border pl-3">
        {evidence.map((e, i) => (
          <li key={i} className="leading-7">
            <span className="mr-1 font-mono text-xs text-muted-foreground">[{STANCE_LABELS[e.stance]}]</span>
            {e.fact}
            <span className="block text-xs text-muted-foreground">原文：「{e.excerpt}」</span>
            <a
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              {e.title || e.url} ↗
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function DirectionInput({
  disabled,
  onSubmit,
  onCancel,
}: {
  disabled: boolean;
  onSubmit: (direction: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-2 flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="往哪个方向推？比如「对广告行业」「如果日元反而贬值」"
        maxLength={100}
      />
      <div className="flex shrink-0 gap-2">
        <Button type="submit" size="sm" disabled={disabled || !value.trim()}>
          按这个方向推
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}

/**
 * 往下推：一棵按需展开的推论树。
 * 每层按可能性从高到低排；可以让它自己推，也可以给方向；每一步都能用贝叶斯算一算。
 */
export function InferenceTree({
  signalId,
  initial,
  bets = {},
}: {
  signalId: string;
  initial: InferenceNode[];
  /** 押过的那几步：结论 → 对账日期（已经格式化好的）。 */
  bets?: Record<string, string>;
}) {
  const [nodes, setNodes] = useState<InferenceNode[]>(initial);
  const [pendingId, setPendingId] = useState<string | null | undefined>(undefined);
  const [directing, setDirecting] = useState<string | null | undefined>(undefined);
  const [bayesOpen, setBayesOpen] = useState<string | null>(null);
  const [betOpen, setBetOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const busy = pendingId !== undefined;

  const expand = (parentId: string | null, direction?: string) => {
    setPendingId(parentId);
    setError(null);
    startTransition(async () => {
      const result = await expandInferenceAction(signalId, parentId, direction);
      if (result.ok) {
        setNodes(result.nodes);
        setDirecting(undefined);
      } else setError(result.message);
      setPendingId(undefined);
    });
  };

  const expandControls = (parentId: string | null, depth: number) => {
    if (depth >= MAX_INFERENCE_DEPTH) {
      return (
        <p className="mt-2 text-xs text-muted-foreground">
          推到第 {MAX_INFERENCE_DEPTH} 层了。再往下，前面每一步都要成立，基本就是在编故事。
        </p>
      );
    }
    const hasFree = childrenOf(nodes, parentId).some((n) => !n.direction);
    return (
      <>
        <div className="mt-2 flex flex-wrap gap-2">
          {!hasFree && (
            <Button variant="ghost" size="sm" className="h-10 sm:h-8" disabled={busy} onClick={() => expand(parentId)}>
              {pendingId === parentId && directing !== parentId
                ? "在推、在查证据…（十几秒）"
                : parentId === null
                  ? "让它自己往下推一层"
                  : "顺着这条再推一层 →"}
            </Button>
          )}
          {directing !== parentId && (
            <Button variant="ghost" size="sm" className="h-10 sm:h-8" disabled={busy} onClick={() => setDirecting(parentId)}>
              我给个方向
            </Button>
          )}
        </div>
        {directing === parentId && (
          <DirectionInput
            disabled={busy}
            onSubmit={(d) => expand(parentId, d)}
            onCancel={() => setDirecting(undefined)}
          />
        )}
        {pendingId === parentId && directing === parentId && (
          <p className="mt-2 text-xs text-muted-foreground">按你给的方向在推…</p>
        )}
      </>
    );
  };

  const renderNode = (n: InferenceNode) => (
    <li key={n.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">第 {n.depth} 层</span>
        <LikelihoodMeter likelihood={n.likelihood} unsure={n.unsure} />
        {n.bayes && (
          <span className="font-mono text-xs text-primary">
            你算的：{formatPercent(posterior(n.bayes.prior, n.bayes.evidence.map(evidenceRatio)))}
          </span>
        )}
      </div>
      <p className="mt-1 text-base font-medium leading-8">{n.claim}</p>
      <p className="text-sm leading-7">
        <span className="text-muted-foreground">为什么：</span>
        {n.why}
      </p>
      <p className="text-sm leading-7">
        <span className="text-muted-foreground">怎么看出它在发生：</span>
        {n.watch}
      </p>
      {n.evidence && n.evidence.length > 0 ? (
        <EvidenceList evidence={n.evidence} />
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">没查到相关的事实，这一步的档位只能凭推理判断。</p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setBayesOpen(bayesOpen === n.id ? null : n.id)}>
          {bayesOpen === n.id ? "收起" : n.bayes ? "看 / 改我算的可能性" : "算一算有多大可能"}
        </Button>
        {bets[n.claim] ? (
          <span className="text-xs text-primary">已经押了，{bets[n.claim]}对账</span>
        ) : (
          <Button variant="ghost" size="sm" className="h-10 sm:h-8" onClick={() => setBetOpen(betOpen === n.id ? null : n.id)}>
            {betOpen === n.id ? "不押了" : "押这一条"}
          </Button>
        )}
      </div>
      {betOpen === n.id && !bets[n.claim] && (
        <div className="mt-2 rounded-md bg-muted/50 p-4">
          <JudgmentForm
            signalId={signalId}
            question={nodeBetQuestion(n.claim)}
            questionLabel="你觉得这一步会不会发生？改成你自己的说法，越具体越好对账。"
            initialJudgment={n.claim}
            submitLabel="押下，进判断账本"
          />
        </div>
      )}
      {bayesOpen === n.id && (
        <BayesPanel signalId={signalId} node={n} onSaved={(next) => setNodes(next)} />
      )}

      {expandControls(n.id, n.depth)}
      {renderChildren(n.id)}
    </li>
  );

  const renderChildren = (parentId: string | null) => {
    const kids = childrenOf(nodes, parentId);
    if (kids.length === 0) return null;
    const free = kids.filter((k) => !k.direction);
    const directions = Array.from(new Set(kids.filter((k) => k.direction).map((k) => k.direction as string)));
    const wrap = parentId ? "mt-3 space-y-5 border-l-2 border-border pl-4" : "space-y-6";
    return (
      <div className={wrap}>
        {free.length > 0 && <ol className="space-y-5">{free.map(renderNode)}</ol>}
        {directions.map((d) => (
          <div key={d}>
            <p className="mb-2 text-xs text-muted-foreground">按你给的方向：「{d}」</p>
            <ol className="space-y-5">{kids.filter((k) => k.direction === d).map(renderNode)}</ol>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <p className="mb-4 text-sm leading-7 text-muted-foreground">
        每一层都假设上一层成立，所以越往下越不确定。每一步都会上网查一次证据；方块是可能性的档位，由另一个模型看着查到的事实来判，不看推论自己写的理由；
        想要具体的数，就在那一步上「算一算」—— AI 起个粗草稿，你来改，代码按贝叶斯算。
      </p>
      {nodes.length > 0 && renderChildren(null)}
      <div className={nodes.length > 0 ? "mt-6 border-t pt-4" : ""}>
        {nodes.length > 0 && <p className="text-xs text-muted-foreground">从新闻本身再推一组：</p>}
        {expandControls(null, 0)}
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
