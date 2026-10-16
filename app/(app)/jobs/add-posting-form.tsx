"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addPostingAction } from "./actions";

/** 手动加一个岗位：贴网址；读不到正文（要登录的网站）就把页面上的字贴进来。手机上用分享进材料箱更快。 */
export function AddPostingForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () =>
    startTransition(async () => {
      setError(null);
      const r = await addPostingAction({ url, text });
      if (r.ok) router.push(`/jobs/${r.id}`);
      else setError(r.message);
    });

  return (
    <div className="space-y-3">
      <Input placeholder="招聘页的网址" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Textarea
        rows={4}
        placeholder="读不到网址的时候（比如 LinkedIn 要登录），把页面上的字整段复制进来"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button disabled={pending || (!url.trim() && !text.trim())} onClick={add}>
          {pending ? "在读……" : "加进来"}
        </Button>
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
      </div>
    </div>
  );
}
