"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startChinaRunAction } from "./actions";

export function StartForm() {
  const router = useRouter();
  const [business, setBusiness] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await startChinaRunAction(business);
      if (!r.ok) setError(r.message);
      else router.push(`/demo/china/${r.id}`);
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Label htmlFor="business">御社の商売をひとことで</Label>
      <Input
        id="business"
        value={business}
        onChange={(e) => setBusiness(e.target.value)}
        placeholder="例：中小企業向けの勤怠管理SaaS"
        maxLength={100}
      />
      <Button type="submit" disabled={pending || business.trim().length === 0}>
        {pending ? "中国語の検索語を考えています…" : "中国で調べる"}
      </Button>
      {error && <p className="text-sm leading-7 text-muted-foreground">{error}</p>}
    </form>
  );
}
