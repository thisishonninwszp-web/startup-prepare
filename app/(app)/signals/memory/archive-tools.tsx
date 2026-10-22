"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArchiveHit, Mark } from "@/lib/domains/signals/memory-shared";
import type { ArchiveStatement } from "@/lib/ai/forecast";
import { MarkButtons } from "../mark-buttons";
import { askArchiveAction, searchArchiveAction } from "../memory-actions";

const OFFLINE = "没连上服务器（网络断了一下），过一会儿再试。";

function HitRow({ h, mark, n }: { h: ArchiveHit; mark?: Mark; n?: number }) {
  return (
    <li className="border-b border-border pb-2 text-sm leading-7 last:border-b-0">
      <div>
        {n !== undefined && <span className="mr-1 font-mono text-xs text-muted-foreground">[{n}]</span>}
        <span className="mr-2 font-mono text-xs text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
        <Link href={`/signals/${h.id}`} className="transition-colors duration-150 hover:text-primary">
          {h.title ?? "（没有标题）"}
        </Link>
        <span className="ml-1 text-xs text-muted-foreground">{h.source}</span>
      </div>
      {h.snippet && <p className="line-clamp-2 text-xs leading-6 text-muted-foreground">{h.snippet}</p>}
      {mark !== undefined || n === undefined ? <MarkButtons signalId={h.id} initial={mark?.mark ?? null} initialNote={mark?.note ?? null} compact /> : null}
    </li>
  );
}

/** 在存档里找：记得原词就按字找，只记得大概就按意思找 —— 两种一起出。 */
export function ArchiveSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ArchiveHit[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await searchArchiveAction(query);
        if (r.ok) {
          setHits(r.hits);
          setMarks(r.marks);
        } else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) run();
          }}
          placeholder="例：中国的外卖平台进日本 / 家事代行 / 日银加息"
          maxLength={200}
        />
        <Button disabled={pending || !query.trim()} onClick={run}>
          {pending ? "在找……" : "找"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hits !== null &&
        (hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">存档里没找到。换个说法再试（按意思找时，写一句完整的话比写一个词准）。</p>
        ) : (
          <ul className="space-y-2">
            {hits.map((h) => (
              <HitRow key={h.id} h={h} mark={marks[h.id] ?? undefined} />
            ))}
          </ul>
        ))}
    </div>
  );
}

/** 问存档：AI 只许用按意思找出来的那十几条回答，每句标出处。 */
export function AskArchive() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ statements: ArchiveStatement[]; sources: ArchiveHit[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await askArchiveAction(question);
        if (r.ok) setAnswer(r.answer);
        else setError(r.message);
      } catch {
        setError(OFFLINE);
      }
    });

  const cited = answer ? Array.from(new Set(answer.statements.flatMap((s) => s.refs))).sort((a, b) => a - b) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && question.trim()) run();
          }}
          placeholder="例：这几个月我看过的关于中国公司进日本的，都有哪些？"
          maxLength={300}
        />
        <Button variant="outline" disabled={pending || !question.trim()} onClick={run}>
          {pending ? "在翻存档……" : "问"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {answer &&
        (answer.statements.length === 0 ? (
          <p className="text-sm text-muted-foreground">存档里没找到能回答这个的。</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1 text-sm leading-7">
              {answer.statements.map((s, i) => (
                <p key={i}>
                  {s.text}
                  {s.refs.length > 0 && <span className="ml-1 font-mono text-xs text-muted-foreground">{s.refs.map((r) => `[${r}]`).join("")}</span>}
                </p>
              ))}
            </div>
            {cited.length > 0 && (
              <ul className="space-y-2 rounded-md border border-border p-3">
                {cited.map((n) => {
                  const h = answer.sources[n - 1];
                  return h ? <HitRow key={h.id} h={h} n={n} /> : null;
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">只用存档里按意思找到的那几条回答，每句后面是出处；存档里没有的事它不许说。</p>
          </div>
        ))}
    </div>
  );
}
