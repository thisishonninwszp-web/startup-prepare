import Link from "next/link";
import { loadActState, nextSteps } from "@/lib/domains/signals/act";

/** 「今天」顶上一行：这周最该做的一件事（和本周行动页同一套排法）。出错就不显示，不耽误读报告。 */
export async function NextActionLine({ userId }: { userId: string }) {
  const state = await loadActState(userId).catch(() => null);
  if (!state) return null;
  const [first] = nextSteps(state);
  return (
    <p className="mb-6 rounded-md border border-border bg-card px-4 py-3 text-sm leading-7">
      <span className="mr-2 font-mono text-xs text-primary">这周最该做的</span>
      <Link href={first.href} className="underline-offset-4 hover:underline">
        {first.text} →
      </Link>
      <Link href="/signals/act" className="ml-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        本周行动
      </Link>
    </p>
  );
}
