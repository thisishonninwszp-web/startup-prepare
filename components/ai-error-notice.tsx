import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { parseAiErrorMessage } from "@/lib/ai-error";

export function AiErrorNotice({
  error,
  className = "",
}: {
  error: string | null | undefined;
  className?: string;
}) {
  if (!error) return null;
  const aiError = parseAiErrorMessage(error);

  if (!aiError) {
    return (
      <div
        className={
          "rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive " +
          className
        }
        role="alert"
      >
        {error}
      </div>
    );
  }

  return (
    <div
      className={
        "rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-950 " +
        className
      }
      role="alert"
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{aiError.message}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-900/80">
            <span className="font-mono">request: {aiError.requestId}</span>
            <span>类型：{aiError.code}</span>
            <span>{aiError.inputSaved ? "输入已保留" : "输入未确认保存"}</span>
            <span>{aiError.retryable ? "可重试" : "不建议立即重试"}</span>
          </div>
          <Link
            href="/settings/ai"
            className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
          >
            打开 AI 诊断
          </Link>
        </div>
      </div>
    </div>
  );
}
