"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCustomerPatternReport,
  createOpportunitiesFromReport,
  promoteCustomerOpportunity,
} from "../actions";
import type {
  listCustomerCases,
  listCustomerPatternReports,
} from "../queries";
import type { CustomerMarket, EmotionBasis } from "../types";
import type { CustomerOpportunity } from "../types";

type Report = Awaited<ReturnType<typeof listCustomerPatternReports>>[number];
type CustomerCase = Awaited<ReturnType<typeof listCustomerCases>>[number];

export function CustomerPatterns({
  initial,
  cases,
}: {
  initial: Report[];
  cases: CustomerCase[];
}) {
  const reports = initial;
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<CustomerMarket[]>([]);
  const [language, setLanguage] = useState("");
  const [source, setSource] = useState("");
  const [alternative, setAlternative] = useState("");
  const [emotionBasis, setEmotionBasis] = useState<EmotionBasis | "">("");
  const [caseId, setCaseId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy("report");
    setError(null);
    try {
      await createCustomerPatternReport({
        query,
        markets,
        languages: language ? [language] : [],
        sources: source ? [source] : [],
        alternatives: alternative,
        emotionBases: emotionBasis ? [emotionBasis] : [],
        caseIds: caseId ? [caseId] : [],
      });
      window.location.reload();
    } catch (caught) {
      console.error("生成顾客模式报告失败", caught);
      setError(caught instanceof Error ? caught.message : "生成失败");
      setBusy(null);
    }
  }

  async function opportunities(reportId: string) {
    setBusy(reportId);
    setError(null);
    try {
      await createOpportunitiesFromReport(reportId);
      window.location.reload();
    } catch (caught) {
      console.error("生成候选机会失败", caught);
      setError(caught instanceof Error ? caught.message : "生成失败");
      setBusy(null);
    }
  }

  async function promote(id: string) {
    setBusy(id);
    setError(null);
    try {
      const ideaId = await promoteCustomerOpportunity(id);
      window.location.href = `/ideas/${ideaId}`;
    } catch (caught) {
      console.error("创建候选想法失败", caught);
      setError(caught instanceof Error ? caught.message : "创建失败");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium">新建模式报告</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="可选：筛选场景、行为或替代方案"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {(["cn", "jp", "en"] as CustomerMarket[]).map((market) => (
              <Button
                key={market}
                type="button"
                onClick={() =>
                  setMarkets((items) =>
                    items.includes(market)
                      ? items.filter((item) => item !== market)
                      : [...items, market]
                  )
                }
                className={
                  "rounded-md border px-2.5 text-xs " +
                  (markets.includes(market)
                    ? "bg-foreground text-background"
                    : "")
                }
              >
                {market}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <select
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            className="rounded-md border px-3 py-2 text-xs"
          >
            <option value="">全部顾客课题</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="来源，例如 reddit"
            className="rounded-md border px-3 py-2 text-xs"
          />
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-md border px-3 py-2 text-xs"
          >
            <option value="">全部语言</option>
            <option value="zh">中文</option>
            <option value="ja">日文</option>
            <option value="en">英文</option>
          </select>
          <select
            value={emotionBasis}
            onChange={(event) =>
              setEmotionBasis(event.target.value as EmotionBasis | "")
            }
            className="rounded-md border px-3 py-2 text-xs"
          >
            <option value="">全部情绪依据</option>
            <option value="stated">顾客明确表达</option>
            <option value="inferred">行为推断</option>
            <option value="unknown">未知</option>
          </select>
        </div>
        <input
          value={alternative}
          onChange={(event) => setAlternative(event.target.value)}
          placeholder="筛选当前替代方案"
          className="mt-3 w-full rounded-md border px-3 py-2 text-xs"
        />
        <Button
          type="button"
          onClick={generate}
          disabled={busy === "report"}
          className="mt-4 gap-2"
        >
          {busy === "report" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          从保留证据生成报告
        </Button>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {reports.map((report) => (
        <article key={report.id} className="rounded-lg border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(report.created_at).toLocaleString("zh-CN")} ·{" "}
                {report.evidence_ids.length} 条证据
              </p>
              <h2 className="mt-2 text-sm font-medium">顾客模式与反例</h2>
            </div>
            {report.opportunities.length === 0 && (
              <Button
                type="button"
                onClick={() => opportunities(report.id)}
                disabled={busy === report.id}
                className="shrink-0 rounded-md border px-3 py-2 text-xs hover:bg-muted"
              >
                生成候选机会
              </Button>
            )}
          </div>
          <div className="mt-5 space-y-5">
            {report.report.patterns.map((pattern, index) => (
              <section key={index} className="border-t pt-4 first:border-0 first:pt-0">
                <h3 className="text-sm font-medium">{pattern.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pattern.situation}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <List title="行为" items={pattern.behaviors} />
                  <List title="阻力" items={pattern.barriers} />
                  <List title="反例" items={pattern.counterexamples} />
                </div>
              </section>
            ))}
          </div>
          {report.report.unknowns.length > 0 && (
            <div className="mt-5 rounded-md bg-muted/50 p-3">
              <List title="仍然未知" items={report.report.unknowns} />
            </div>
          )}
          {report.opportunities.length > 0 && (
            <div className="mt-6 border-t pt-5">
              <h3 className="text-xs font-medium">候选机会（未排名）</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {report.opportunities.map((item) => {
                  const draft = item.draft as CustomerOpportunity;
                  return (
                    <div key={item.id} className="rounded-md border p-4">
                      <p className="text-sm font-medium">{draft.direction}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        致命假设：{draft.fatal_assumption}
                      </p>
                      {item.created_idea_id ? (
                        <Link
                          href={`/ideas/${item.created_idea_id}`}
                          className="mt-4 inline-flex items-center gap-1 text-xs underline"
                        >
                          查看想法 <ArrowRight className="size-3" />
                        </Link>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => promote(item.id)}
                          disabled={busy === item.id}
                          className="mt-4 text-xs underline underline-offset-4"
                        >
                          明确选择并创建观察
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="text-xs leading-5">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
