"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

const FLOW = [
  ["01", "记录观察"],
  ["02", "假设化"],
  ["03", "AI 质疑"],
  ["04", "验证行动"],
  ["05", "Go / Kill"],
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setInfo(
          "注册成功。如果开启了邮箱确认，请先到邮箱点击确认链接，再回来登录。"
        );
        setMode("signin");
        setLoading(false);
      }
    }
  }

  return (
    <main className="grid min-h-[100dvh] grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* 左：产品主张（品牌时刻） */}
      <section className="bg-dotgrid relative flex flex-col justify-between overflow-hidden border-b px-6 py-10 sm:px-10 lg:border-b-0 lg:border-r lg:py-16">
        <span className="animate-fade-in font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          IdeaOS
        </span>

        <div className="max-w-md py-12 lg:py-0">
          <h1 className="animate-fade-up text-4xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-5xl">
            <span className="text-muted-foreground/70">你的对手不是市场，</span>
            <br />
            是你自己的大脑。
          </h1>
          <p
            className="animate-fade-up mt-6 max-w-sm text-[15px] leading-relaxed text-muted-foreground"
            style={{ animationDelay: "0.1s" }}
          >
            一个对抗认知偏误的决策系统。不打分、不迎合，只逼你把想法证伪。
          </p>

          <ol className="mt-10 space-y-px">
            {FLOW.map(([n, label], i) => (
              <li
                key={n}
                className="animate-fade-up flex items-baseline gap-3 border-t border-border/60 py-2.5 text-sm"
                style={{ animationDelay: `${0.18 + i * 0.07}s` }}
              >
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {n}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <span
          className="animate-fade-in hidden text-xs text-muted-foreground lg:block"
          style={{ animationDelay: "0.5s" }}
        >
          产品的敌人，是使用者自己的大脑。
        </span>
      </section>

      {/* 右：登录 / 注册 */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div
          className="animate-fade-up w-full max-w-sm"
          style={{ animationDelay: "0.15s" }}
        >
          <h2 className="text-xl font-semibold tracking-tight">
            {mode === "signin" ? "登录以继续" : "创建一个账号"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "回到你的想法库。"
              : "开始记录你的第一条观察。"}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {info && <p className="text-sm text-muted-foreground">{info}</p>}

            <Button
              type="submit"
              className="w-full transition-transform active:scale-[0.99]"
              disabled={loading}
            >
              {loading ? "处理中…" : mode === "signin" ? "登录" : "注册"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            {mode === "signin" ? "还没有账号？" : "已经有账号了？"}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
              }}
            >
              {mode === "signin" ? "去注册" : "去登录"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
