"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClippedMaterial, createUrlMaterial } from "../actions";
import { parseClipMessage, type ClipPayload } from "../clip-shared";

/** 等多久还没收到正文，就当这个网站不让递（会把弹出的窗口隔开的网站）。 */
const WAIT_MS = 3000;

export function ClipReceiver({ fallbackUrl, fallbackTitle }: { fallbackUrl: string; fallbackTitle: string }) {
  const router = useRouter();
  const [clip, setClip] = useState<ClipPayload | null>(null);
  const [state, setState] = useState<"waiting" | "got" | "none">("waiting");
  const [useSelection, setUseSelection] = useState(true);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // 只认打开这一页的那个窗口递来的
      if (!window.opener || e.source !== window.opener) return;
      const payload = parseClipMessage(e.data);
      if (!payload) return;
      setClip(payload);
      setUseSelection(!!payload.selection);
      setState("got");
    };
    window.addEventListener("message", onMessage);
    // 告诉原来那个网页"准备好了"。不知道它是哪个网站，只能发给 *；发出去的只有这一句，没有任何内容
    window.opener?.postMessage({ type: "ideaos-clip-ready" }, "*");
    const timer = setTimeout(() => setState((s) => (s === "waiting" ? "none" : s)), WAIT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, []);

  const url = clip?.url ?? fallbackUrl;
  const title = clip?.title || fallbackTitle;
  const body = clip ? (useSelection && clip.selection ? clip.selection : clip.text) : "";

  const done = (id: string) => router.push(`/materials/${id}`);

  const saveClip = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await createClippedMaterial({ url, title, text: body, note });
        done(r.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "没存上");
      }
    });

  const saveUrlOnly = () =>
    startTransition(async () => {
      setError(null);
      try {
        const r = await createUrlMaterial(url, note);
        done(r.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "没存上");
      }
    });

  if (!url) {
    return <p className="text-sm leading-7 text-muted-foreground">这一页要从书签小工具打开。去材料箱，把「存进 IdeaOS」拖到书签栏。</p>;
  }

  return (
    <div className="space-y-4 text-sm leading-7">
      <div>
        <p className="font-medium">{title || "（没有标题）"}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">{url}</p>
      </div>

      {state === "waiting" && <p className="text-muted-foreground">在等那个网页把正文递过来……</p>}

      {state === "none" && (
        <p className="rounded-md bg-muted/60 p-3 text-muted-foreground">
          那个网站没把正文递过来（有的网站会把弹出的窗口隔开）。可以只存网址，让服务器去读；
          要登录才能看的页面服务器读不到 —— 那就回到那一页，复制正文，粘到材料箱里。
        </p>
      )}

      {state === "got" && clip && (
        <>
          {clip.selection && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={useSelection ? "secondary" : "ghost"} onClick={() => setUseSelection(true)}>
                只存选中的那段（{[...clip.selection].length} 字）
              </Button>
              <Button size="sm" variant={useSelection ? "ghost" : "secondary"} onClick={() => setUseSelection(false)}>
                存整页（{[...clip.text].length} 字）
              </Button>
            </div>
          )}
          {!clip.selection && <p className="font-mono text-xs text-muted-foreground">收到正文 {[...clip.text].length} 字</p>}
          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background p-3 text-xs leading-6 whitespace-pre-wrap">
            {body.slice(0, 1500)}
            {body.length > 1500 ? "……" : ""}
          </div>
        </>
      )}

      {state !== "waiting" && (
        <>
          <label className="block space-y-1.5">
            <span className="font-medium">为什么存这个（可以空着）</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </label>
          <div className="flex flex-wrap gap-2">
            {state === "got" && (
              <Button disabled={pending || body.trim().length < 20} onClick={saveClip}>
                {pending ? "在存……" : "存进材料箱"}
              </Button>
            )}
            <Button variant={state === "got" ? "ghost" : "default"} disabled={pending} onClick={saveUrlOnly}>
              {pending ? "在存……" : "只存网址，让服务器去读"}
            </Button>
          </div>
        </>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
