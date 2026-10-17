"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ATLAS_CATEGORIES, type AtlasCategory } from "@/lib/domains/signals/atlas-shared";
import type { DeepStance } from "@/lib/domains/signals/deep-shared";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import {
  BLOCKER_OPTIONS,
  FIRST_MOVER_OPTIONS,
  ISSUE_NOTE_MAX,
  STANCE_OPTIONS,
  STANCE_YEARS,
  stanceSentence,
  type PickStance,
} from "@/lib/domains/signals/issue-shared";
import { OptionRow } from "../../issue/option-row";
import { saveDeepCategoryAction, saveDeepStanceAction } from "../../actions";

/** ⑤ 这条属于哪一类：点了就存，页面按这一类列先例。 */
export function CategoryPicker({ signalId, side, initial }: { signalId: string; side: GapSide; initial: AtlasCategory | null }) {
  const router = useRouter();
  const [value, setValue] = useState<AtlasCategory | undefined>(initial ?? undefined);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (v: AtlasCategory | undefined) => {
    if (!v || pending) return;
    setValue(v);
    startTransition(async () => {
      setError(null);
      const result = await saveDeepCategoryAction(signalId, side, v);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };
  return (
    <div>
      <OptionRow label="这属于哪一类？" options={ATLAS_CATEGORIES} value={value} onChange={pick} required />
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** ⑧ 你的判断：周刊那三下 + 补一句。存在这一页，到周刊页还在；押进判断账本照旧是第一次记"发了"的时候。 */
export function DeepJudgment({
  signalId,
  side,
  here,
  initial,
}: {
  signalId: string;
  side: GapSide;
  here: string;
  initial: DeepStance | null;
}) {
  const [stance, setStance] = useState<Partial<PickStance>>(initial?.stance ?? {});
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(!!initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<PickStance>) => {
    setStance((s) => ({ ...s, ...patch }));
    setSaved(false);
  };
  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveDeepStanceAction(signalId, side, stance, note);
      if (result.ok) setSaved(true);
      else setError(result.message);
    });
  return (
    <div className="space-y-2">
      <OptionRow label={`${STANCE_YEARS} 年内${here}会不会出现？`} options={STANCE_OPTIONS} value={stance.will} onChange={(v) => change({ will: v })} required />
      <OptionRow label="最大的阻碍？" options={BLOCKER_OPTIONS} value={stance.blocker} onChange={(v) => change({ blocker: v })} />
      <OptionRow label="谁最可能先做？" options={FIRST_MOVER_OPTIONS} value={stance.firstMover} onChange={(v) => change({ firstMover: v })} />
      <Textarea
        value={note}
        maxLength={ISSUE_NOTE_MAX}
        rows={2}
        placeholder="想多说一句？原样接在后面（可以不写）"
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
      />
      {stance.will && (
        <p className="text-sm leading-7">
          <span className="text-muted-foreground">发出去的是：</span>
          {stanceSentence(stance as PickStance, here, note)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending || !stance.will || saved} onClick={save}>
          {saved ? "存好了" : "存下"}
        </Button>
        {saved && (
          <Link href={`/signals/issue?pick=${side}:${signalId}`} className="text-sm text-primary underline-offset-4 hover:underline">
            用这一条写一期 →
          </Link>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
