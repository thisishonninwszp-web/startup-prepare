"use client";

import { Button } from "@/components/ui/button";

/** 一排可以点的选项；required 的点了就不能取消，其余点第二下取消。周刊和一条讲透共用。 */
export function OptionRow<K extends string>({
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  label: string;
  options: Record<K, string>;
  value: K | undefined;
  onChange: (v: K | undefined) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as K[]).map((k) => (
          <Button key={k} size="sm" variant={value === k ? "secondary" : "ghost"} onClick={() => onChange(value === k && !required ? undefined : k)}>
            {options[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}
