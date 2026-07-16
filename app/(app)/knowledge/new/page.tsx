"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createKnowledgeCard } from "../actions";
import { CARD_TYPES, type CardType } from "../types";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";

export default function NewKnowledgeCardPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [cardType, setCardType] = useState<CardType>("market");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        await createKnowledgeCard(content, cardType, tags);
        router.push("/knowledge");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  return (
    <PageContainer width="narrow">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/knowledge" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">添加知识卡片</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium">类型</label>
          <div className="flex flex-wrap gap-2">
            {CARD_TYPES.map((t) => (
              <Button
                key={t.key}
                type="button"
                onClick={() => setCardType(t.key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  cardType === t.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {cardType === "market" && "关于市场、行业、竞争格局的客观事实"}
            {cardType === "customer" && "关于目标顾客行为、痛苦、购买决策的规律"}
            {cardType === "judgment" && "关于你自己过去的判断模式与偏差"}
            {cardType === "domain" && "领域方法论或通用知识"}
          </p>
        </div>

        <div>
          <label htmlFor="content" className="mb-1.5 block text-sm font-medium">
            内容 <span className="text-muted-foreground font-normal">（一句话陈述事实）</span>
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              cardType === "market"
                ? "例：B2B SaaS 在日本的平均采购周期是 6 个月"
                : cardType === "customer"
                ? "例：独立开发者不愿付超过 $20/月的工具费用"
                : cardType === "judgment"
                ? "例：我之前 3 次在 B2B 项目中低估了销售难度"
                : "例：做到 PMF 通常需要至少 50 次用户访谈"
            }
            rows={3}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>

        <div>
          <label htmlFor="tags" className="mb-1.5 block text-sm font-medium">
            标签 <span className="text-muted-foreground font-normal">（用逗号分隔，可选）</span>
          </label>
          <input
            id="tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例：日本市场, B2B, SaaS"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={isPending || !content.trim()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {isPending ? "保存中…" : "保存卡片"}
          </Button>
          <Link
            href="/knowledge"
            className="rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            取消
          </Link>
        </div>
      </form>
    </PageContainer>
  );
}
