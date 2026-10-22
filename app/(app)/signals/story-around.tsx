import Link from "next/link";
import type { ArchiveHit } from "@/lib/domains/signals/memory-shared";

function Row({ h }: { h: ArchiveHit }) {
  return (
    <li className="text-sm leading-7">
      <span className="mr-2 font-mono text-xs text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
      <Link href={`/signals/${h.id}`} className="transition-colors duration-150 hover:text-primary">
        {h.title ?? "（没有标题）"}
      </Link>
      <span className="ml-1 text-xs text-muted-foreground">{h.source}</span>
    </li>
  );
}

/** 这件事以前和后来：存档里意思够近的几条（同一件事的前后消息），按时间排。 */
export function StoryAround({ story }: { story: { before: ArchiveHit[]; after: ArchiveHit[] } }) {
  if (story.before.length === 0 && story.after.length === 0) {
    return <p className="text-sm leading-7 text-muted-foreground">存档里还没有同一件事的其它消息。</p>;
  }
  return (
    <div className="space-y-4">
      {story.before.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">以前（新的在前）</p>
          <ul className="mt-1 space-y-1">
            {story.before.map((h) => (
              <Row key={h.id} h={h} />
            ))}
          </ul>
        </div>
      )}
      {story.after.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">后来</p>
          <ul className="mt-1 space-y-1">
            {story.after.map((h) => (
              <Row key={h.id} h={h} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
