import type { AnalogCheck } from "@/lib/ai";

function searchLink(q: string): string {
  return `https://www.google.com/search?${new URLSearchParams({ q })}`;
}

/**
 * 上网核实的结果：查到出处 / AI 说错了已改正 / 没查到。
 * 历史参照和报告里的"日本这边"共用。没有 check（早期缓存、核实失败）时只给查证链接。
 */
export function SourceCheckView({
  check,
  searchQuery,
  unverifiedText,
  uncheckedText,
}: {
  check?: AnalogCheck;
  searchQuery: string;
  /** 查过但没查到出处时的那句话。 */
  unverifiedText: string;
  /** 没核实过时的那句话。 */
  uncheckedText: string;
}) {
  if (!check || check.status === "unverified") {
    return (
      <p className="text-xs text-muted-foreground">
        {check ? unverifiedText : uncheckedText}
        <a
          href={searchLink(searchQuery)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          自己去查 ↗
        </a>
      </p>
    );
  }
  return (
    <div className="text-xs">
      {check.status === "corrected" ? (
        <p className="text-primary">AI 原来说错了，已按查到的原文改正：{check.correction}</p>
      ) : (
        <p className="text-muted-foreground">查到出处</p>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer text-muted-foreground">看原文</summary>
        <ul className="mt-1 space-y-2 leading-6 text-muted-foreground">
          {check.basis.map((b, j) => (
            <li key={j}>
              「{b.excerpt}」
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-primary underline-offset-4 hover:underline"
              >
                {b.title || "来源"} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
