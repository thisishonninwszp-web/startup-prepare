import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listKnowledgeCards } from "./queries";
import { CARD_TYPES, type CardType } from "./types";

export const dynamic = "force-dynamic";

const CARD_TYPE_COLORS: Record<CardType, string> = {
  market: "bg-blue-50 text-blue-700 border-blue-200",
  customer: "bg-purple-50 text-purple-700 border-purple-200",
  judgment: "bg-amber-50 text-amber-700 border-amber-200",
  domain: "bg-green-50 text-green-700 border-green-200",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activeType = CARD_TYPES.find((t) => t.key === searchParams.type)?.key;
  const cards = await listKnowledgeCards(user!.id, activeType);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">知识库</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              积累市场事实、顾客规律、判断历史，AI 质疑时自动引用
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            href="/knowledge/new"
            className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            <Plus className="h-4 w-4" />
            添加
          </Link>
          <Link
            href="/materials"
            className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
          >
            外部材料（网页/文件/原话）走材料箱 →
          </Link>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/knowledge"
          className={`rounded-full border px-3 py-1 text-xs ${
            !activeType
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground"
          }`}
        >
          全部 ({cards.length > 0 || !activeType ? "" : "0"}
          {activeType ? "" : cards.length})
        </Link>
        {CARD_TYPES.map((t) => (
          <Link
            key={t.key}
            href={`/knowledge?type=${t.key}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              activeType === t.key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {activeType ? `暂无${CARD_TYPES.find((t) => t.key === activeType)?.label}类知识卡片` : "还没有知识卡片"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            记录你在验证中发现的市场规律、判断偏差……
          </p>
          <Link
            href="/knowledge/new"
            className="mt-4 inline-flex items-center gap-1 text-sm underline underline-offset-4"
          >
            <Plus className="h-3.5 w-3.5" />
            添加第一张知识卡片
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => {
            const typeInfo = CARD_TYPES.find((t) => t.key === card.card_type);
            return (
              <div
                key={card.id}
                className="rounded-xl border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="flex-1 text-sm leading-relaxed">{card.content}</p>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CARD_TYPE_COLORS[card.card_type]}`}
                  >
                    {typeInfo?.label ?? card.card_type}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {card.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {card.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {card.source_type === "extracted" ? "AI 提炼 · " : ""}
                    {fmtDate(card.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
