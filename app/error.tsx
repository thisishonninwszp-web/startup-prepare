"use client";

export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f7f7f5] px-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Something broke
      </p>
      <h1 className="max-w-md text-lg font-medium">
        这一页出错了，不是你的数据丢了。
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || "发生了一个未知错误。"}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-md bg-stone-950 px-4 py-2 text-sm text-stone-50"
      >
        重试
      </button>
    </div>
  );
}
