"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DOOR_LIMITS, doorLang, type FakeDoorContent } from "@/lib/domains/signals/fake-door-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import type { DoorSignup, FakeDoor } from "@/lib/domains/signals/fake-door";
import { deleteDoorSignupAction, draftFakeDoorAction, saveFakeDoorAction, setFakeDoorOpenAction } from "../../actions";

const EMPTY: FakeDoorContent = { title: "", lead: "", points: [], audience: "", price: "", operator: "" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** 起草 → 改、填价格 → 发布；发布过的显示链接、看了几次、开关。 */
export function DoorEditor({ signalId, side, here, door }: { signalId: string; side: GapSide; here: string; door: FakeDoor | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FakeDoorContent | null>(door ? door.content : null);
  const [editing, setEditing] = useState(!door);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const lang = doorLang(side);
  const set = (patch: Partial<FakeDoorContent>) => setForm((f) => ({ ...(f ?? EMPTY), ...patch }));

  const draft = () =>
    startTransition(async () => {
      setError(null);
      const r = await draftFakeDoorAction(signalId, side);
      if (r.ok) setForm((f) => ({ ...EMPTY, ...r.draft, price: f?.price ?? "", operator: f?.operator ?? "" }));
      else setError(r.message);
    });

  const save = () =>
    startTransition(async () => {
      setError(null);
      const r = await saveFakeDoorAction(signalId, side, form);
      if (r.ok) {
        setEditing(false);
        router.refresh();
      } else setError(r.message);
    });

  const link = door && origin ? `${origin}/soon/${door.token}` : "";

  return (
    <div className="space-y-6">
      {door && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm leading-7">
          <p className="font-mono text-xs text-muted-foreground">
            {door.open ? "开着" : "关着（页面只说募集结束）"} · 看了 {door.views} 次
          </p>
          {link && <p className="mt-1 break-all font-mono text-xs">{link}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!link}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "复制好了" : "复制链接"}
            </Button>
            {link && (
              <Button size="sm" variant="ghost" asChild>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  看看页面 ↗
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing((e) => !e)}>
              {editing ? "不改了" : "改文字"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await setFakeDoorOpenAction(door.id, !door.open);
                  if (r.ok) router.refresh();
                  else setError(r.message);
                })
              }
            >
              {door.open ? "关掉" : "重新打开"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">自己点开看不会算进去太多：同一个标签页只数一次。</p>
        </div>
      )}

      {editing && !form && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={draft}>
              {pending ? "在起草……十几秒" : "让 AI 起草一版"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setForm({ ...EMPTY, points: ["", "", ""] })}>
              自己从头写
            </Button>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            页面用{lang === "ja" ? "日文" : "中文"}（给{here}的陌生人看）。起草完你逐句改，价格自己填，看过了再发布。
          </p>
        </div>
      )}

      {editing && form && (
        <div className="space-y-4">
          <Field label="标题" hint="一句说明它做什么的话。不起品牌名，不用真实公司或产品的名字。">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={DOOR_LIMITS.title + 10} />
          </Field>
          <Field label="说明" hint="一到两句：帮谁解决什么麻烦。">
            <Textarea value={form.lead} onChange={(e) => set({ lead: e.target.value })} rows={3} />
          </Field>
          <Field label="用起来是什么样" hint={`一行一条，最多 ${DOOR_LIMITS.points} 条。`}>
            <Textarea
              value={form.points.join("\n")}
              onChange={(e) => set({ points: e.target.value.split("\n") })}
              rows={4}
            />
          </Field>
          <Field label="适合谁">
            <Input value={form.audience} onChange={(e) => set({ audience: e.target.value })} />
          </Field>
          <Field label="预计价格（必填）" hint={lang === "ja" ? "例：月額 980円 / 1回 1,500円" : "例：每月 30 元 / 每次 50 元"}>
            <Input value={form.price} onChange={(e) => set({ price: e.target.value })} maxLength={DOOR_LIMITS.price} />
          </Field>
          <Field label="运营者（选填）" hint="名字，或者你的 note / X 账号。写了更像一个真人在问；不写就显示「个人筹备中」。">
            <Input value={form.operator} onChange={(e) => set({ operator: e.target.value })} maxLength={DOOR_LIMITS.operator} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={save}>
              {pending ? "在存……" : door ? "保存" : "发布，拿到链接"}
            </Button>
            {!door && (
              <Button variant="ghost" disabled={pending} onClick={draft}>
                {pending ? "在起草……" : "让 AI 重新起草（价格和运营者保留）"}
              </Button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** 留了邮箱的人：邮箱、写的那句、哪天；可以删（连同那条观察）。 */
export function SignupList({ signups }: { signups: DoorSignup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (signups.length === 0) return <p className="mt-3 text-sm text-muted-foreground">还没有人留邮箱。</p>;
  return (
    <>
      <ul className="mt-3 space-y-3">
        {signups.map((s) => (
          <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 text-sm last:border-b-0">
            <div>
              <p className="font-mono">{s.email}</p>
              {s.note && <p className="mt-1 leading-7">「{s.note}」</p>}
              <p className="text-xs text-muted-foreground">{s.created_at.slice(0, 10)}</p>
            </div>
            <ConfirmButton
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await deleteDoorSignupAction(s.id);
                  if (r.ok) router.refresh();
                  else setError(r.message);
                })
              }
            >
              删掉
            </ConfirmButton>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
