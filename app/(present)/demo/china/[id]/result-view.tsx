import { Badge } from "@/components/ui/badge";
import { holdsLabel, quoteLang, type ChinaRun, type JapanCondition, type SourcedQuote } from "@/lib/domains/jobs/china-shared";

function holdsVariant(c: JapanCondition): "secondary" | "outline" | "muted" {
  if (c.holds === "yes") return "secondary";
  if (c.holds === "no") return "outline";
  return "muted";
}

function Quote({ quote }: { quote: SourcedQuote }) {
  return (
    <div className="text-sm leading-7">
      <blockquote lang={quoteLang(quote.excerpt)} className="border-l-2 border-border pl-3">
        {quote.excerpt}
      </blockquote>
      <a
        href={quote.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
      >
        {quote.title || quote.url}
      </a>
    </div>
  );
}

/** 三块结果：中国的公司、条件日本有没有、中国同行来没来过。没跑到的那块不显示。不打分、不下结论。 */
export function ResultView({ run }: { run: ChinaRun }) {
  const found = run.companies;
  const japan = run.japan;
  return (
    <div className="space-y-10">
      {found && (
        <section>
          <h2 className="text-base font-semibold">中国で同じ商売をしている会社</h2>
          {found.companies.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              見つかりませんでした（読んだページ {found.read} 件）。もう一度探すか、もう少し具体的に書くと（誰に・何を売っているか）、見つかることがあります。
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {found.companies.map((c) => (
                <div key={`${c.url}-${c.name}`} className="rounded-lg border border-border p-4">
                  <p className="font-medium" lang={quoteLang(c.name)}>
                    {c.name}
                  </p>
                  <p className="mt-1 text-sm leading-7">{c.what_ja}</p>
                  <p className="mt-3 text-xs text-muted-foreground">原文（このページにそのまま載っていることを確認済み）</p>
                  <Quote quote={{ url: c.url, title: c.title, excerpt: c.excerpt }} />
                  <p className="mt-3 text-xs text-muted-foreground">AI訳</p>
                  <p className="text-sm leading-7">{c.excerpt_ja}</p>
                  <div className="mt-3">
                    <Badge variant={c.same ? "secondary" : "muted"}>
                      {c.same ? "同じ商売かどうか、別のAIでも確認済み" : "別のAIの確認はまだ"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {japan && (
        <section>
          <h2 className="text-base font-semibold">中国でうまくいった条件は、日本にもあるか</h2>
          <div className="mt-4 space-y-4">
            {japan.conditions.map((c, i) => (
              <div key={i} className="rounded-lg border border-border p-4 text-sm leading-7">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.name}</p>
                  <Badge variant={holdsVariant(c)}>{holdsLabel(c)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">中国では（AIの説明・出典なし）</p>
                <p>{c.there_ja}</p>
                <p className="mt-2 text-xs text-muted-foreground">日本では</p>
                <p>{c.here_ja}</p>
                {c.basis.map((b) => (
                  <div key={`${b.url}-${b.excerpt}`} className="mt-2">
                    <Quote quote={b} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {japan && (
        <section>
          <h2 className="text-base font-semibold">中国の同業は日本に来たか</h2>
          {japan.entrants.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">見つかった資料の中には出てきませんでした。来ていないとは限りません。</p>
          ) : (
            <div className="mt-4 space-y-4">
              {japan.entrants.map((e, i) => (
                <div key={i} className="rounded-lg border border-border p-4 text-sm leading-7">
                  <p>{e.text_ja}</p>
                  {e.basis.map((b) => (
                    <div key={`${b.url}-${b.excerpt}`} className="mt-2">
                      <Quote quote={b} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
