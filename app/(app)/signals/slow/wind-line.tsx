import Link from "next/link";
import { SLOW_VARIABLES } from "@/lib/domains/signals/slow";
import { WIND_LABEL, type WindLink } from "@/lib/domains/signals/slow-then-shared";

const LABELS = new Map(SLOW_VARIABLES.map((v) => [v.key, v.label]));

/** 差距清单的一条、想法页上：它顺着、逆着哪几个慢变量（点进慢变量页看为什么）。没有就不显示。 */
export function WindLine({ links }: { links: WindLink[] }) {
  if (links.length === 0) return null;
  return (
    <p className="mt-1 text-xs leading-6 text-muted-foreground">
      <Link href="/signals/slow" className="underline-offset-4 hover:text-foreground hover:underline">
        慢变量
      </Link>
      ：
      {links.map((l, i) => (
        <span key={`${l.key}-${l.dir}`} title={l.why}>
          {i > 0 ? " · " : ""}
          <span className={l.dir === "tail" ? "text-verdict-learned" : "text-destructive"}>{WIND_LABEL[l.dir]}</span> {LABELS.get(l.key) ?? l.key}
        </span>
      ))}
    </p>
  );
}

/** 慢变量卡片里：你手上顺着它的、逆着它的东西，各带一句为什么。 */
export function WindList({ links }: { links: WindLink[] }) {
  const tail = links.filter((l) => l.dir === "tail");
  const head = links.filter((l) => l.dir === "head");
  const href = (l: WindLink) => (l.kind === "idea" ? `/ideas/${l.ref}` : "/signals/gaps");
  const block = (title: string, list: WindLink[]) =>
    list.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-muted-foreground">{title}</p>
        <ul className="mt-1 space-y-1">
          {list.map((l) => (
            <li key={`${l.kind}-${l.ref}`}>
              <Link href={href(l)} className="text-primary underline-offset-4 hover:underline">
                {l.kind === "idea" ? "想法：" : ""}
                {l.title}
              </Link>
              <span className="ml-1 text-muted-foreground">—— {l.why}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="mt-3 rounded-md border border-border p-3 text-sm leading-7">
      <p className="font-medium">对你手上的东西</p>
      {tail.length === 0 && head.length === 0 ? (
        <p className="text-xs leading-6 text-muted-foreground">你的差距清单和想法库里，没有明显顺着或逆着它走的。</p>
      ) : (
        <>
          {block("顺风：这个数字照现在的方向走，它越来越有戏", tail)}
          {block("逆风：这个数字照现在的方向走，它越来越难", head)}
        </>
      )}
    </div>
  );
}
