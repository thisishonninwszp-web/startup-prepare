import { AppShell } from "@/components/app-shell";

export function SystemPreview({
  eyebrow,
  title,
  statement,
  principles,
}: {
  eyebrow: string;
  title: string;
  statement: string;
  principles: { label: string; text: string }[];
}) {
  return (
    <AppShell>
      <main className="bg-dotgrid min-h-screen px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
            {statement}
          </p>

          <div className="mt-16 border-t">
            {principles.map((principle, index) => (
              <div
                key={principle.label}
                className="grid gap-3 border-b py-6 sm:grid-cols-[7rem_1fr]"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")} / {principle.label}
                </span>
                <p className="max-w-xl text-sm leading-6">{principle.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            独立系统正在设计中 · 当前不提供空壳操作
          </div>
        </div>
      </main>
    </AppShell>
  );
}
