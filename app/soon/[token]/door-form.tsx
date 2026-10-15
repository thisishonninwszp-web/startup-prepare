"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DOOR_NOTE_MAX, DOOR_TEXT, type DoorLang } from "@/lib/domains/signals/fake-door-shared";
import { recordDoorViewAction, signupDoorAction } from "../actions";

/**
 * 看了一次就报一次（同一个标签页只报一次）。用脚本报：小红书、LINE 的链接预览和搜索爬虫一般不跑脚本，不会被算进去。
 */
export function DoorViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    const key = `door-view:${token}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // 隐私模式读不了 sessionStorage：照报，多数一次也比不数强
    }
    void recordDoorViewAction(token);
  }, [token]);
  return null;
}

/** 留邮箱。藏起来的那一格是给机器人填的（人看不到）。 */
export function DoorSignupForm({ token, lang }: { token: string; lang: DoorLang }) {
  const t = DOOR_TEXT[lang];
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelLink, setCancelLink] = useState<string | null>(null);

  if (cancelLink) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm leading-7">
        <p className="font-medium">{t.thanks}</p>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">{t.cancelHint}</p>
        <p className="mt-1 break-all font-mono text-xs">{cancelLink}</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const r = await signupDoorAction(token, email, note, trap);
          if (r.ok) setCancelLink(`${window.location.origin}/soon/cancel/${r.cancelToken}`);
          // 原因和固定文字同名：invalid / duplicate / busy / closed / failed
          else setError(t[r.reason]);
        });
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t.email}</span>
        <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t.note}</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={DOOR_NOTE_MAX} rows={3} />
      </label>
      {/* 给机器人填的：人看不到、读屏软件跳过、Tab 也跳过 */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <Input tabIndex={-1} autoComplete="off" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || !email.trim()} className="w-full sm:w-auto">
        {pending ? t.submitting : t.submit}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs leading-6 text-muted-foreground">{t.privacy}</p>
    </form>
  );
}
