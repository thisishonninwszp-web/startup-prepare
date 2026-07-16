"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createCompany } from "@/app/(app)/knowledge/actions";
import { COMPANY_TYPES, type CompanyType } from "@/app/(app)/knowledge/types";

export default function NewCompanyPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [companyType, setCompanyType] = useState<CompanyType>("prospect");
  const [ceoNotes, setCeoNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createCompany(name, companyType, ceoNotes);
        router.push(`/companies/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/companies" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">新建公司档案</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            公司名称
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：株式会社エムソフト"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">类型</label>
          <div className="flex flex-wrap gap-2">
            {COMPANY_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setCompanyType(t.key)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  companyType === t.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="ceoNotes" className="mb-1.5 block text-sm font-medium">
            CEO / 关键人思路 <span className="text-muted-foreground font-normal">（可选）</span>
          </label>
          <textarea
            id="ceoNotes"
            value={ceoNotes}
            onChange={(e) => setCeoNotes(e.target.value)}
            placeholder="例：社长重视制造业数字化，对 DTF 技术非常关注，过去决策偏保守……"
            rows={4}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {isPending ? "保存中…" : "创建档案"}
          </button>
          <Link
            href="/companies"
            className="rounded-lg border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
