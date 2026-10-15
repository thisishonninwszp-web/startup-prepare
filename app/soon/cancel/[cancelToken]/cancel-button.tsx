"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DOOR_TEXT, type DoorLang } from "@/lib/domains/signals/fake-door-shared";
import { cancelSignupAction } from "../../actions";

export function CancelSignupButton({ cancelToken, lang }: { cancelToken: string; lang: DoorLang }) {
  const t = DOOR_TEXT[lang];
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<boolean | null>(null);
  if (done !== null) return <p className="text-sm leading-7">{done ? t.cancelled : t.cancelMissing}</p>;
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(async () => setDone(await cancelSignupAction(cancelToken)))}
    >
      {t.cancelButton}
    </Button>
  );
}
