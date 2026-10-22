import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getFakeDoor, ISSUE_DOOR_AUDIENCE, listDoorSignups, type DoorLang } from "@/lib/domains/signals/fake-door";
import { DoorEditor, SignupList } from "../../gaps/door/door-editor";

export const dynamic = "force-dynamic";
// AI 起草要十几秒，由这一页的 server action 跑
export const maxDuration = 60;

const LANG_LABEL: Record<DoorLang, string> = { zh: "中文页", ja: "日文页" };

/**
 * 周刊本身的假门：这份周刊能不能卖。中文页给想做日本市场的中国公司、做跨境的人；日文页给日本公司做新规事业的人。
 * 有人看着价格还留邮箱，就有了一个不用开发任何东西的生意 —— 付费版先手工发几期就行。
 */
export default async function IssueDoorPage({ searchParams }: { searchParams: { lang?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const lang: DoorLang = searchParams.lang === "ja" ? "ja" : "zh";
  const door = await getFakeDoor(user.id, { kind: "issue", lang });
  const signups = door && typeof door !== "string" ? await listDoorSignups(user.id, door.id) : [];

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/issue" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 周刊
        </Link>
      </p>
      <PageHeader
        eyebrow="Paid edition"
        title="这份周刊能不能卖"
        description="你每周已经在做一样东西：核实过的「那边有、日本还没有」，带出处、时差基准、能不能搬过来、你下的判断和公开对账。给它的付费版做一页「准备中」，看陌生人看着价格还愿不愿意留邮箱。有人留，就有了一个不用开发任何东西、下个月就能收钱的生意。"
      />

      <p className="mb-6 flex flex-wrap gap-4 text-sm">
        {(["zh", "ja"] as DoorLang[]).map((l) =>
          l === lang ? (
            <span key={l} className="font-medium">
              {LANG_LABEL[l]}（给{ISSUE_DOOR_AUDIENCE[l]}）
            </span>
          ) : (
            <Link key={l} href={`/signals/issue/door?lang=${l}`} className="text-primary underline-offset-4 hover:underline">
              {LANG_LABEL[l]} →
            </Link>
          )
        )}
      </p>

      {door === "missing-schema" || door === "missing-077" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 {door === "missing-schema" ? "076" : "077"} 没跑。执行 supabase/migrations/
          {door === "missing-schema" ? "076_signal_fake_doors.sql" : "077_signal_fake_door_issue.sql"} 之后再来。
        </p>
      ) : (
        <>
          <DoorEditor target={{ kind: "issue", lang }} readers={ISSUE_DOOR_AUDIENCE[lang]} door={door} />
          {door && (
            <section className="mt-10">
              <h2 className="text-base font-semibold">留了邮箱的人（{signups.length}）</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                只有你看得到。这些人是潜在的第一批付费读者 —— 联系的那一次，可以问一句「你最想每周知道什么」。
              </p>
              <SignupList signups={signups} />
            </section>
          )}
          <section className="mt-10 border-t pt-6 text-xs leading-6 text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">规矩和用法</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>页面上一定写着「还没有、现在不收钱、邮箱只联系一次、随时可以取消」—— 由代码加，改不了。</li>
              <li>不许写读者人数、命中率、「能赚钱」—— 你还没有这些，陌生人信的是诚实。</li>
              <li>价格写成每月多少（例：每月 3,000 円 / 每月 98 元）。不写价格的「感兴趣」没有意义。</li>
              <li>链接会自动放进周刊：中文页进中文长文的文末，日文页进 note 版的文末；小红书不让放外链，放主页简介。</li>
              <li>有人留邮箱也不用急着开发：付费版先手工做几期（邮件、note 的会员限定文章都行），确认有人续费再说。</li>
            </ul>
          </section>
        </>
      )}
    </PageContainer>
  );
}
