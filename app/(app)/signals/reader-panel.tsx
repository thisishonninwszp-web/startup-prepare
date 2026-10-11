import Link from "next/link";
import { loadSignalReader } from "@/lib/domains/signals/brief";
import { loadSituationFacts } from "@/lib/domains/signals/reader-facts";

/**
 * AI 读新闻时知道的"你"：摊开给人看。
 * 报告里每一句"跟你"都只能从这里来；这里空，它就不该说"跟你"。
 * 处境事实带原文出处 —— 看得见它从哪句话里抽的，才知道它有没有抽错。
 */
export async function ReaderPanel({ userId }: { userId: string }) {
  const facts = await loadSituationFacts(userId).catch(() => []);
  const reader = await loadSignalReader(userId, facts);
  const counts = [
    ["处境", facts.length],
    ["观察", reader.observations.length],
    ["自我判断", reader.hypotheses.length],
    ["技能", reader.skills.length],
    ["想法", reader.ideas.length],
    ["梦想", reader.dreams.length],
  ] as const;
  const empty = counts.every(([, n]) => n === 0);

  return (
    <details className="mb-8 rounded-lg border bg-card p-4 text-sm">
      <summary className="cursor-pointer leading-7">
        <span className="font-medium">AI 读新闻时知道的你</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          {counts.map(([label, n]) => `${label} ${n}`).join(" · ")}
        </span>
      </summary>

      <div className="mt-4 space-y-5 leading-7">
        <p className="text-muted-foreground">
          {empty
            ? "它现在对你一无所知，所以报告里的「跟你」只会说这件事影响谁。"
            : "它说「跟你」的时候，只能从下面这些里找。"}
          不用另外填 —— 在
          <Link href="/self" className="mx-1 text-primary underline-offset-4 hover:underline">自我</Link>
          里写自述、攒证据，在
          <Link href="/capture" className="mx-1 text-primary underline-offset-4 hover:underline">捕捉</Link>
          里多记观察，它就会更懂你。
        </p>

        {facts.length > 0 && (
          <div>
            <h3 className="font-medium">处境（从你的自述里抽的事实，自我评价不抽）</h3>
            <ul className="mt-1 space-y-2">
              {facts.map((f, i) => (
                <li key={i}>
                  {f.fact}
                  <span className="block text-xs text-muted-foreground">原话：「{f.quote}」</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(
          [
            ["最近 30 天的观察", reader.observations],
            ["有行为支撑的自我判断", reader.hypotheses],
            ["点亮的技能", reader.skills],
            ["手上的想法", reader.ideas],
            ["梦想", reader.dreams],
          ] as const
        )
          .filter(([, items]) => items.length > 0)
          .map(([title, items]) => (
            <div key={title}>
              <h3 className="font-medium">{title}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {items.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </details>
  );
}
