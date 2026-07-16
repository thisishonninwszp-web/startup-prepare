"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BUSINESS_DOMAINS,
  PERSONAL_DOMAINS,
  type RealityContext,
  type RealityMode,
  type RealitySourceType,
} from "../types";
import {
  createRealityCase,
  type RealitySourceRef,
} from "../actions";
import type { RealitySourceOption } from "../queries";

const SOURCE_LABEL: Record<RealitySourceType | "all", string> = {
  all: "全部",
  observation: "观察",
  idea: "想法",
  validation: "验证",
  prediction: "预测",
};

export function NewRealityForm({
  sources,
}: {
  sources: RealitySourceOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<RealityMode>("specific");
  const [context, setContext] = useState<RealityContext>("personal");
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [domains, setDomains] = useState<string[]>(PERSONAL_DOMAINS);
  const [customDomain, setCustomDomain] = useState("");
  const [sourceFilter, setSourceFilter] = useState<RealitySourceType | "all">(
    "all"
  );
  const [selected, setSelected] = useState<RealitySourceRef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableDomains = useMemo(() => {
    if (context === "personal") return PERSONAL_DOMAINS;
    if (context === "business") return BUSINESS_DOMAINS;
    return [...PERSONAL_DOMAINS, ...BUSINESS_DOMAINS];
  }, [context]);
  const visibleSources =
    sourceFilter === "all"
      ? sources
      : sources.filter((source) => source.type === sourceFilter);

  function changeContext(next: RealityContext) {
    setContext(next);
    if (next === "personal") setDomains(PERSONAL_DOMAINS);
    if (next === "business") setDomains(BUSINESS_DOMAINS);
    if (next === "cross")
      setDomains([...PERSONAL_DOMAINS, ...BUSINESS_DOMAINS]);
  }

  function toggleSource(source: RealitySourceOption) {
    const exists = selected.some(
      (item) => item.type === source.type && item.id === source.id
    );
    if (exists) {
      setSelected((items) =>
        items.filter(
          (item) => !(item.type === source.type && item.id === source.id)
        )
      );
      return;
    }
    if (selected.length >= 20) {
      setError("最多选择20条来源");
      return;
    }
    setSelected((items) => [...items, { type: source.type, id: source.id }]);
  }

  function addDomain() {
    const value = customDomain.trim();
    if (!value || domains.includes(value)) return;
    setDomains((items) => [...items, value]);
    setCustomDomain("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const id = await createRealityCase(
        {
          mode,
          context,
          title,
          initialStatement: statement,
          domains: mode === "global" ? domains : [],
        },
        selected
      );
      router.push(`/reality/${id}`);
      router.refresh();
    } catch (caught) {
      console.error("创建现状课题失败", caught);
      setError(caught instanceof Error ? caught.message : "创建失败");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-10">
      <section>
        <StepLabel number="01" label="入口" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            {
              value: "specific" as const,
              title: "具体课题",
              text: "围绕一个困境、选择或正在卡住的问题。",
            },
            {
              value: "global" as const,
              title: "全局扫描",
              text: "从人生或事业整体寻找最需要看清的地方。",
            },
          ].map((item) => (
            <Button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={
                "rounded-lg border p-4 text-left transition-colors " +
                (mode === item.value
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card hover:bg-muted/50")
              }
            >
              <div className="text-sm font-medium">{item.title}</div>
              <p
                className={
                  "mt-2 text-xs leading-5 " +
                  (mode === item.value
                    ? "text-background/70"
                    : "text-muted-foreground")
                }
              >
                {item.text}
              </p>
            </Button>
          ))}
        </div>
      </section>

      <section>
        <StepLabel number="02" label="语境" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["personal", "人生"],
            ["business", "事业"],
            ["cross", "人生 × 事业"],
          ].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              onClick={() => changeContext(value as RealityContext)}
              className={
                "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                (context === value
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card hover:bg-muted")
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </section>

      <section>
        <StepLabel number="03" label="当前描述" />
        <div className="mt-3 space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              mode === "global" ? "例如：我现在真正卡在哪里" : "给这个课题一句标题"
            }
            className="w-full rounded-md border bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            rows={6}
            placeholder="发生了什么？你目前如何理解它？哪些地方让你不确定？"
            className="w-full resize-y rounded-md border bg-card px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </section>

      {mode === "global" && (
        <section>
          <StepLabel number="04" label="扫描领域" />
          <div className="mt-3 flex flex-wrap gap-2">
            {availableDomains.map((domain) => {
              const active = domains.includes(domain);
              return (
                <Button
                  key={domain}
                  type="button"
                  onClick={() =>
                    setDomains((items) =>
                      active
                        ? items.filter((item) => item !== domain)
                        : [...items, domain]
                    )
                  }
                  className={
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs " +
                    (active ? "bg-muted text-foreground" : "text-muted-foreground")
                  }
                >
                  {active && <Check className="size-3" />}
                  {domain}
                </Button>
              );
            })}
            {domains
              .filter((domain) => !availableDomains.includes(domain))
              .map((domain) => (
                <Button
                  key={domain}
                  type="button"
                  onClick={() =>
                    setDomains((items) => items.filter((item) => item !== domain))
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2.5 py-1.5 text-xs"
                >
                  {domain}
                  <X className="size-3" />
                </Button>
              ))}
          </div>
          <div className="mt-3 flex max-w-sm gap-2">
            <input
              value={customDomain}
              onChange={(event) => setCustomDomain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDomain();
                }
              }}
              placeholder="添加自己的领域"
              className="min-w-0 flex-1 rounded-md border bg-card px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              onClick={addDomain}
              className="grid size-9 place-items-center rounded-md border bg-card hover:bg-muted"
              aria-label="添加领域"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </section>
      )}

      <section>
        <StepLabel
          number={mode === "global" ? "05" : "04"}
          label="引用已有记录（可选）"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          只选择真正相关的记录。系统会保存引用时的快照，不会把全部历史自动塞给AI。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(SOURCE_LABEL) as (RealitySourceType | "all")[]).map(
            (type) => (
              <Button
                key={type}
                type="button"
                onClick={() => setSourceFilter(type)}
                className={
                  "rounded-full px-3 py-1 text-xs " +
                  (sourceFilter === type
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground")
                }
              >
                {SOURCE_LABEL[type]}
              </Button>
            )
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            已选 {selected.length} / 20
          </span>
        </div>
        <div className="mt-3 max-h-72 divide-y overflow-y-auto rounded-lg border bg-card">
          {visibleSources.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">没有可引用的记录。</p>
          ) : (
            visibleSources.map((source) => {
              const active = selected.some(
                (item) => item.type === source.type && item.id === source.id
              );
              return (
                <Button
                  key={`${source.type}:${source.id}`}
                  type="button"
                  onClick={() => toggleSource(source)}
                  className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40"
                >
                  <span
                    className={
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded border " +
                      (active
                        ? "border-foreground bg-foreground text-background"
                        : "")
                    }
                  >
                    {active && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{source.label}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {source.detail}
                    </span>
                  </span>
                </Button>
              );
            })
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? "创建中…" : "开始看清现状"}
          {!saving && <ArrowRight className="size-4" />}
        </Button>
      </div>
    </form>
  );
}

function StepLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-muted-foreground">{number}</span>
      <h2 className="text-sm font-medium">{label}</h2>
    </div>
  );
}
