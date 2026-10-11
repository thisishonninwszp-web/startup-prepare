"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  clampRatio,
  EVIDENCE_STRENGTHS,
  evidenceRatio,
  formatPercent,
  MAX_RATIO,
  posterior,
  PRIOR_BUCKETS,
  type BayesState,
  type EvidenceStrength,
  type InferenceNode,
} from "@/lib/domains/signals/inference-shared";
import { draftBayesAction, saveBayesAction } from "./actions";

function oddsText(p: number): string {
  const q = Math.min(0.99, Math.max(0.01, p));
  const odds = q / (1 - q);
  return odds >= 1 ? `${odds.toFixed(1)} : 1` : `1 : ${(1 / odds).toFixed(1)}`;
}

function ratioText(r: number): string {
  const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
  return r >= 1 ? `×${fmt(r)}` : `÷${fmt(1 / r)}`;
}

/** 滑块用对数刻度：-100 = ÷5，0 = ×1，100 = ×5。往两边拖同样的距离，推高和压低的力度一样。 */
const toSlider = (r: number) => Math.round((Math.log(clampRatio(r)) / Math.log(MAX_RATIO)) * 100);
const fromSlider = (v: number) => clampRatio(Math.pow(MAX_RATIO, v / 100));

/**
 * 在推论的某一步上算可能性：AI 起粗档草稿（先验五档、证据强度五档），你改，代码按贝叶斯算。
 * 最后的数是你确认过的估计，不是 AI 给的。算式全部摊开：先验赔率 × 每条证据的倍数 = 结果。
 * 小心锚定：草稿会把你往它那边拉。先想一下你自己会怎么选，再看它选了什么。
 */
export function BayesPanel({
  signalId,
  node,
  onSaved,
}: {
  signalId: string;
  node: InferenceNode;
  onSaved: (nodes: InferenceNode[]) => void;
}) {
  const [state, setState] = useState<BayesState | null>(node.bayes ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!state) {
    if (pending) {
      return (
        <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">AI 在起草稿……</p>
          <Skeleton className="h-4 w-5/6" />
        </div>
      );
    }
    return (
      <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm leading-7">
        <p>
          贝叶斯的做法：先问「这类事平常有多常见」（先验），再一条条看证据，每条把可能性往上或往下推一点。
        </p>
        <p className="text-muted-foreground">
          AI 先起一个粗草稿，你来改。草稿会把你往它那边拉 —— 点开之前，先想想你自己会怎么估。
        </p>
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={() =>
            startTransition(async () => {
              const result = await draftBayesAction(signalId, node.id);
              if (result.ok) {
                setState(result.state);
                setError(null);
              } else setError(result.message);
            })
          }
        >
          让 AI 起个草稿
        </Button>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const ratios = state.evidence.map(evidenceRatio);
  const result = posterior(state.prior, ratios);
  const draftPriorLabel = PRIOR_BUCKETS.find((b) => b.key === state.draft.prior)?.label;

  const setPrior = (prior: number) => {
    setSaved(false);
    setState({ ...state, prior });
  };
  /** 点快捷档：回到这一档的标准倍数，清掉细调。 */
  const setStrength = (i: number, strength: EvidenceStrength) => {
    setSaved(false);
    setState({ ...state, evidence: state.evidence.map((e, j) => (j === i ? { ...e, strength, ratio: undefined } : e)) });
  };
  const setRatio = (i: number, ratio: number) => {
    setSaved(false);
    setState({ ...state, evidence: state.evidence.map((e, j) => (j === i ? { ...e, ratio } : e)) });
  };

  return (
    <div className="mt-2 space-y-5 rounded-md bg-muted/50 p-4 text-sm leading-7">
      <div>
        <p className="font-medium">1. 这类事平常有多常见？（先验）</p>
        <p className="text-muted-foreground">AI 的草稿：{draftPriorLabel}。{state.priorWhy}</p>
        <div className="mt-2 grid grid-cols-5 gap-1 sm:flex sm:flex-wrap">
          {PRIOR_BUCKETS.map((b) => (
            <Button
              key={b.key}
              type="button"
              size="sm"
              className="h-10 px-1 text-xs sm:h-8 sm:px-3"
              variant={Math.abs(state.prior - b.value) < 0.001 ? "secondary" : "ghost"}
              onClick={() => setPrior(b.value)}
            >
              {b.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={95}
            step={5}
            value={Math.round(state.prior * 100)}
            onChange={(e) => setPrior(Number(e.target.value) / 100)}
            className="w-full accent-primary"
            aria-label="先验"
          />
          <span className="w-12 shrink-0 text-right font-mono">{formatPercent(state.prior)}</span>
        </div>
      </div>

      <div>
        <p className="font-medium">2. 每条证据把可能性推高还是压低？</p>
        <ul className="mt-2 space-y-4">
          {state.evidence.map((e, i) => {
            const draftLabel = EVIDENCE_STRENGTHS.find((s) => s.key === state.draft.evidence[i])?.label;
            return (
              <li key={i}>
                <p>{e.text}</p>
                <p className="text-muted-foreground">
                  {e.why}（AI 的草稿：{draftLabel}）
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary underline-offset-4 hover:underline"
                    >
                      来源 ↗
                    </a>
                  ) : (
                    <span className="ml-1 text-xs">（没有来源，是 AI 凭印象想的）</span>
                  )}
                </p>
                <div className="mt-1 grid grid-cols-5 gap-1 sm:flex sm:flex-wrap">
                  {EVIDENCE_STRENGTHS.map((s) => (
                    <Button
                      key={s.key}
                      type="button"
                      size="sm"
                      className="h-10 px-1 text-xs sm:h-8 sm:px-3"
                      variant={e.strength === s.key && e.ratio === undefined ? "secondary" : "ghost"}
                      onClick={() => setStrength(i, s.key)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                {/* 滑块占满整行（手机上手指才拖得准），刻度和当前倍数放在下面 */}
                <div className="mt-2">
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={toSlider(evidenceRatio(e))}
                    onChange={(ev) => setRatio(i, fromSlider(Number(ev.target.value)))}
                    className="h-6 w-full accent-primary"
                    aria-label="这条证据的力度"
                  />
                  <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                    <span>÷5 压低</span>
                    <span className="text-sm text-foreground">{ratioText(evidenceRatio(e))}</span>
                    <span>推高 ×5</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t pt-4">
        <p className="font-medium">
          3. 算出来：<span className="font-mono text-lg">{formatPercent(result)}</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">这是你确认过的估计</span>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          先验 {formatPercent(state.prior)}（赔率 {oddsText(state.prior)}）
          {ratios.map((r) => ` ${ratioText(r)}`).join("")} → 赔率 {oddsText(result)} →{" "}
          {formatPercent(result)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          这是「在前面那几步都成立」的前提下这一步的可能性。整条链都发生的可能性，要把每一步乘起来，会低得多。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveBayesAction(signalId, node.id, state);
                if (r.ok) {
                  onSaved(r.nodes);
                  setSaved(true);
                  setError(null);
                } else setError(r.message);
              })
            }
          >
            {pending ? "存着…" : "存下我的估计"}
          </Button>
          {saved && <span className="text-xs text-muted-foreground">存好了</span>}
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
