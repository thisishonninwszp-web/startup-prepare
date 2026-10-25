import Link from "next/link";
import type { EarlierMention } from "@/lib/domains/signals/followups";
import { compareReadingEvidence, sourceEvidence, type ReadingEvidence } from "@/lib/domains/signals/reading-insight-shared";
import { formatReportDate } from "@/lib/domains/signals/format";

function SourceLink({ url, children }: { url: string | null; children: React.ReactNode }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
      {children} ↗
    </a>
  ) : null;
}

export function EarlierComparison({ item, earlier, showBackground = true }: { item: ReadingEvidence; earlier: EarlierMention; showBackground?: boolean }) {
  const comparison = compareReadingEvidence(item, earlier.previous);
  const previous = earlier.previous ? sourceEvidence(earlier.previous) : null;
  return (
    <section className="mt-4 rounded-md border bg-muted/30 p-3 text-sm leading-7">
      <h3 className="font-medium">相比上次报道</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        上次是 {formatReportDate(earlier.brief_date)} · <Link href={`/signals/${earlier.signal_id}`} className="underline-offset-4 hover:underline">{earlier.headline}</Link>
      </p>
      {comparison.status === "different_excerpts" ? (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">本次不同的原文摘录</p>
          <ul className="mt-1 space-y-1">
            {comparison.differentExcerpts.map((text) => <li key={text}>「{text}」</li>)}
          </ul>
        </div>
      ) : showBackground && comparison.previousBackground ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">按需展开前后 AI 背景对照</summary>
          <div className="mt-2 space-y-2">
            <p><span className="text-muted-foreground">上次 AI 整理：</span>{comparison.previousBackground}</p>
            <p><span className="text-muted-foreground">本次 AI 整理：</span>{item.background}</p>
          </div>
        </details>
      ) : null}
      {previous && previous.excerpts.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">对照上次原文摘录</summary>
          <ul className="mt-1 space-y-1">
            {previous.excerpts.map((text) => <li key={text}>「{text}」</li>)}
          </ul>
          <SourceLink url={previous.url}>上次来源</SourceLink>
        </details>
      )}
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{comparison.notice}</p>
    </section>
  );
}

export function ReportEvidence({ item, earlier, showBackground = true }: { item: ReadingEvidence; earlier?: EarlierMention; showBackground?: boolean }) {
  const source = sourceEvidence(item);
  return (
    <div className="mt-3 space-y-4">
      <section className="rounded-md border p-3 text-sm leading-7">
        <h3 className="font-medium">来源原文</h3>
        {source.excerpts.length > 0 && (
          <ul className="mt-2 space-y-2">
            {source.excerpts.map((text) => <li key={text}>「{text}」</li>)}
          </ul>
        )}
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{source.notice}</p>
        <div className="mt-1 text-xs"><SourceLink url={source.url}>核对完整原文</SourceLink></div>
      </section>
      {showBackground && item.background && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground">AI 整理的背景 · 解释与推断仍需核实</h3>
          <p className="mt-1 text-base leading-8">{item.background}</p>
        </section>
      )}
      {earlier && <EarlierComparison item={item} earlier={earlier} showBackground={showBackground} />}
    </div>
  );
}
