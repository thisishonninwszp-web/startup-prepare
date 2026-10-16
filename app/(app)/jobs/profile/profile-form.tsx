"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_CATEGORIES, EMPTY_PERSONAL, JOB_CATEGORIES, PERSONAL_FIELDS, type JobProfile } from "@/lib/domains/jobs/shared";
import { saveJobProfileAction } from "../actions";

/** 第一次填的时候先放上他说过的条件（2026-10-16：四类都要、大阪或远程、现在 500 万、450 万以上为宜、技人国）。 */
const FIRST_TIME: JobProfile = {
  categories: ALL_CATEGORIES,
  locations: ["大阪"],
  salaryNow: 500,
  salaryFloor: 450,
  visa: "gijinkoku",
  personal: EMPTY_PERSONAL,
  lastSearchOn: null,
};

export function ProfileForm({ profile }: { profile: JobProfile | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const p = profile ?? FIRST_TIME;

  const save = () =>
    startTransition(async () => {
      if (!formRef.current) return;
      setMessage(null);
      const r = await saveJobProfileAction(new FormData(formRef.current));
      if (r.ok) {
        setMessage("存好了。");
        router.refresh();
      } else setMessage(r.message);
    });

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-8"
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">找哪几类</legend>
        {ALL_CATEGORIES.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="categories" value={c} defaultChecked={p.categories.includes(c)} />
            {JOB_CATEGORIES[c]}
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="locations">地点</Label>
        <Input id="locations" name="locations" defaultValue={p.locations.join("、")} />
        <p className="text-xs leading-6 text-muted-foreground">用顿号隔开，比如「大阪、京都」。全远程和基本远程的岗位不管在哪都会留下。</p>
      </div>

      <div className="space-y-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="salary_now">现在的年收（万日元）</Label>
            <Input id="salary_now" name="salary_now" inputMode="numeric" defaultValue={p.salaryNow ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salary_floor">最好不低于（万日元）</Label>
            <Input id="salary_floor" name="salary_floor" inputMode="numeric" defaultValue={p.salaryFloor ?? ""} />
          </div>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          低于这个数的岗位不会被丢掉，只是写出比现在少多少，旁边列上别的条件。补不补得上，你自己判断。
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">在留资格</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="visa" value="gijinkoku" defaultChecked={p.visa === "gijinkoku"} />
          技人国：每个岗位标一句工作内容对不对得上
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="visa" value="none" defaultChecked={p.visa === "none"} />
          不用对
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">个人信息（只用来打印简历）</legend>
        {PERSONAL_FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key}>{label}</Label>
            <Input id={key} name={key} defaultValue={p.personal[key]} />
          </div>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "在存……" : "存下来"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}
