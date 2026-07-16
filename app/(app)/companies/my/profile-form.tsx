"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ensureOwnCompanyProfile } from "./actions";
import { Button } from "@/components/ui/button";

export function ProfileForm({
  initialName = "",
}: {
  initialName?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        startTransition(async () => {
          try {
            await ensureOwnCompanyProfile(name);
            router.refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "保存失败");
          }
        });
      }}
    >
      <label className="block text-sm font-medium" htmlFor="company-name">
        公司名称
      </label>
      <div className="flex gap-2">
        <input
          id="company-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="仅用于你自己的内部档案"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <Button
          type="submit"
          disabled={pending || !name.trim()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "保存中…" : initialName ? "更新" : "建立档案"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
