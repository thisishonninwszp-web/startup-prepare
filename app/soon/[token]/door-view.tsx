import { PageContainer } from "@/components/ui/page-container";
import { DOOR_TEXT, type DoorLang, type FakeDoorContent } from "@/lib/domains/signals/fake-door-shared";
import { DoorSignupForm, DoorViewBeacon } from "./door-form";

/**
 * 假门测试公开页的样子：一样还没有的服务，写明预计价格，留邮箱"做出来了告诉我"。
 * "还没有这个服务、现在不收钱、邮箱只联系一次"由代码加，AI 和他都改不了。
 */
export function DoorView({ token, door }: { token: string; door: { lang: DoorLang; content: FakeDoorContent; open: boolean } }) {
  const t = DOOR_TEXT[door.lang];
  const c = door.content;
  return (
    <PageContainer width="narrow">
      <div lang={door.lang === "ja" ? "ja" : "zh-CN"} className="py-12">
        <p className="inline-block rounded-full border border-primary px-3 py-0.5 text-xs font-medium text-primary">{t.badge}</p>
        <h1 className="mt-4 text-2xl font-semibold leading-snug sm:text-3xl">{c.title}</h1>
        <p className="mt-4 text-base leading-8">{c.lead}</p>

        <ul className="mt-6 space-y-3">
          {c.points.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm leading-7">
              <span className="font-mono text-primary">{String(i + 1).padStart(2, "0")}</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-8 grid gap-3 border-y border-border py-5 text-sm sm:grid-cols-2">
          {c.audience && (
            <div>
              <dt className="text-xs text-muted-foreground">{t.audience}</dt>
              <dd className="mt-1 leading-7">{c.audience}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">{t.price}</dt>
            <dd className="mt-1 text-lg font-semibold">{c.price}</dd>
          </div>
        </dl>

        <p className="mt-6 rounded-md bg-muted/60 p-4 text-sm leading-7">{t.notice}</p>

        <div className="mt-8">
          {door.open ? (
            <>
              <DoorViewBeacon token={token} />
              <DoorSignupForm token={token} lang={door.lang} />
            </>
          ) : (
            <p className="text-sm leading-7 text-muted-foreground">{t.closed}</p>
          )}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          {t.operator}：{c.operator || t.operatorFallback}
        </p>
      </div>
    </PageContainer>
  );
}
