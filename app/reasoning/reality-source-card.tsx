import Link from "next/link";
import type { RealityReasoningSnapshot } from "./reality-source";

const CONTEXT_LABEL = {
  personal: "人生",
  business: "事业",
  cross: "人生 × 事业",
} as const;

export function RealitySourceCard({
  snapshot,
  showLink = false,
}: {
  snapshot: RealityReasoningSnapshot;
  showLink?: boolean;
}) {
  const content = (
    <>
      <p className="text-xs text-muted-foreground">来自现状认识</p>
      <p className="mt-1 text-sm font-medium">
        {snapshot.realityCase.title} · v{snapshot.version.version_no}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {CONTEXT_LABEL[snapshot.realityCase.context]} ·{" "}
        {new Date(snapshot.version.created_at).toLocaleDateString("zh-CN")}
      </p>
      {snapshot.selected_path && (
        <p className="mt-2 text-xs">
          当前路径：{snapshot.selected_path.title}
        </p>
      )}
    </>
  );

  return showLink ? (
    <Link
      href={`/reality/${snapshot.realityCase.id}#current-next-move`}
      className="block rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/60"
    >
      {content}
      <p className="mt-3 border-t pt-3 text-xs font-medium">
        分析完成，回到原课题收束 →
      </p>
    </Link>
  ) : (
    <section className="rounded-lg border bg-muted/30 p-4">{content}</section>
  );
}
