"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCustomerCase } from "../actions";
import {
  CUSTOMER_MARKETS,
  type CustomerMarket,
} from "../types";

const MARKET_LABEL: Record<CustomerMarket, string> = {
  cn: "中国市场",
  jp: "日本市场",
  en: "英语市场",
};

export function NewCustomerCaseForm({
  ideas,
  initialIdeaId,
}: {
  ideas: { id: string; title: string; status: string }[];
  initialIdeaId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [context, setContext] = useState("");
  const [belief, setBelief] = useState("");
  const [markets, setMarkets] = useState<CustomerMarket[]>(["cn"]);
  const [ideaId, setIdeaId] = useState(initialIdeaId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const id = await createCustomerCase({
        title,
        customerHypothesis: customer,
        problemContext: context,
        originalBelief: belief,
        markets,
        ideaId: ideaId || null,
      });
      router.push(`/customer-view/${id}`);
      router.refresh();
    } catch (caught) {
      console.error("创建顾客课题失败", caught);
      setError(caught instanceof Error ? caught.message : "创建失败");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Field label="课题标题" hint="这是研究问题，不是产品名称。">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：小型电商团队如何处理月末对账"
          className="w-full rounded-md border bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field label="暂定顾客" hint="用处境描述，不要只写年龄或职业。">
        <textarea
          value={customer}
          onChange={(event) => setCustomer(event.target.value)}
          rows={3}
          placeholder="例如：没有专职财务、每月自己核对多个平台流水的小型电商经营者"
          className="w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field label="具体问题场景" hint="什么时候发生？现在怎么处理？">
        <textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          rows={4}
          placeholder="描述触发时刻、任务和你目前知道的替代方案"
          className="w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field label="我原先以为" hint="把你的高傲、猜测和结论先暴露出来。">
        <textarea
          value={belief}
          onChange={(event) => setBelief(event.target.value)}
          rows={4}
          placeholder="我以为他们……"
          className="w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field label="研究市场" hint="不同市场的习惯与付费语境不混在一起。">
        <div className="flex flex-wrap gap-2">
          {CUSTOMER_MARKETS.map((market) => {
            const active = markets.includes(market);
            return (
              <button
                key={market}
                type="button"
                onClick={() =>
                  setMarkets((current) =>
                    active
                      ? current.filter((item) => item !== market)
                      : [...current, market]
                  )
                }
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs " +
                  (active
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground")
                }
              >
                {active && <Check className="size-3" />}
                {MARKET_LABEL[market]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="关联已有想法（可选）" hint="独立研究时留空。">
        <select
          value={ideaId}
          onChange={(event) => setIdeaId(event.target.value)}
          className="w-full rounded-md border bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">不关联想法</option>
          {ideas.map((idea) => (
            <option key={idea.id} value={idea.id}>
              {idea.title} · {idea.status}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? "创建中…" : "创建研究课题"}
          {!saving && <ArrowRight className="size-4" />}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
