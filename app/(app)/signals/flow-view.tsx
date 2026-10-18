import { FLOW_STEPS, type FlowStep, type ItemFlow } from "@/lib/domains/signals/flow-shared";

/** 一图看懂：起因 → 发生了什么 → 谁受影响 → 接下来盯什么。手机上竖着排，宽屏横着排；「接下来盯什么」那一框用朱砂描边。 */
export function FlowView({ flow }: { flow: ItemFlow }) {
  const steps = Object.keys(FLOW_STEPS) as FlowStep[];
  return (
    <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="一图看懂">
      {steps.map((step, i) => (
        <li key={step} className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center">
          <div className={"flex-1 rounded-md border px-3 py-2 " + (step === "watch" ? "border-primary" : "border-border bg-card")}>
            <p className="text-xs text-muted-foreground">{FLOW_STEPS[step]}</p>
            <p className="text-sm leading-7">{flow[step]}</p>
          </div>
          {i < steps.length - 1 && (
            <span aria-hidden className="text-center text-muted-foreground">
              <span className="sm:hidden">↓</span>
              <span className="hidden sm:inline">→</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
