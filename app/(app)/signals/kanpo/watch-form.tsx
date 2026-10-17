"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addWatchAction } from "./actions";

/** 加一家：中国那边的名字 + 日本法人名（一行一种写法）。从时差图谱点进来时带着那一件的 id 和备注。 */
export function WatchForm({ caseId, note: initialNote }: { caseId: string | null; note: string }) {
  const router = useRouter();
  const [nameZh, setNameZh] = useState("");
  const [aliases, setAliases] = useState("");
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await addWatchAction({ name_zh: nameZh, aliases, note, case_id: caseId });
      if (!r.ok) setError(r.message);
      else {
        setNameZh("");
        setAliases("");
        setNote("");
        router.replace("/signals/kanpo");
        router.refresh();
      }
    });

  return (
    <div className="space-y-3 text-sm">
      <Input value={nameZh} onChange={(e) => setNameZh(e.target.value)} placeholder="中国那边的名字，例：谭仔国际" />
      <Textarea
        rows={3}
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder={"日本法人名，一行一种写法（官报上登的那个名字），例：\n株式会社譚仔日本"}
      />
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（选填）" />
      <Button size="sm" disabled={pending || !nameZh.trim() || !aliases.trim()} onClick={submit}>
        {pending ? "在加…" : "加进名单"}
      </Button>
      {caseId && <p className="text-xs text-muted-foreground">从时差图谱点进来的：加好以后，图谱那一件旁边会显示它的官报决算。</p>}
      {error && <p className="text-xs text-muted-foreground">{error}</p>}
    </div>
  );
}
