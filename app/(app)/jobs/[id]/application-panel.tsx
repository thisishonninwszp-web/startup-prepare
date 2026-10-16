"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_STATUSES,
  CHANNELS,
  EFFECTIVE_LABELS,
  effectiveStatus,
  tokyoDate,
  type ApplicationStatus,
  type Channel,
  type JobApplication,
} from "@/lib/domains/jobs/shared";
import { recordApplicationAction, setApplicationStatusAction } from "../actions";

export function ApplicationPanel({
  postingId,
  resumeId,
  application,
  defaultChannel,
}: {
  postingId: string;
  resumeId: string | null;
  application: JobApplication | null;
  defaultChannel: Channel;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [appliedOn, setAppliedOn] = useState(tokyoDate());
  const [salary, setSalary] = useState(application?.offered_salary ? String(application.offered_salary) : "");

  const act = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  if (!application) {
    return (
      <section className="space-y-3 text-sm leading-7">
        <h2 className="text-base font-semibold">投了吗</h2>
        <p className="text-muted-foreground">投出去以后记一下，不记的话一个月后数不出「哪类回了几家」。</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CHANNELS) as Channel[]).map((c) => (
            <Button key={c} size="sm" variant={channel === c ? "default" : "outline"} onClick={() => setChannel(c)}>
              {CHANNELS[c]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-8 w-40" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
          <Button size="sm" disabled={pending} onClick={() => act(() => recordApplicationAction({ postingId, resumeId, channel, appliedOn }))}>
            记下：投了
          </Button>
        </div>
        {error && <p className="text-muted-foreground">{error}</p>}
      </section>
    );
  }

  const current = effectiveStatus(application, tokyoDate());
  return (
    <section className="space-y-3 text-sm leading-7">
      <h2 className="text-base font-semibold">投递</h2>
      <p>
        {application.applied_on} 从{CHANNELS[application.channel]}投的 · 现在：{EFFECTIVE_LABELS[current]}
      </p>
      {application.events.length > 0 && (
        <p className="text-xs text-muted-foreground">{application.events.map((e) => `${e.on} ${APPLICATION_STATUSES[e.status]}`).join(" → ")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(APPLICATION_STATUSES) as ApplicationStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={application.status === s ? "default" : "outline"}
            disabled={pending}
            onClick={() => act(() => setApplicationStatusAction({ id: application.id, postingId, status: s, offeredSalary: salary }))}
          >
            {APPLICATION_STATUSES[s]}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        对方提的年收（万日元，选填）
        <Input inputMode="numeric" className="h-8 w-24" value={salary} onChange={(e) => setSalary(e.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">填了年收再点一下现在的状态，就会存上。</p>
      {error && <p className="text-muted-foreground">{error}</p>}
    </section>
  );
}
