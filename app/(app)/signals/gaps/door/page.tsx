import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { findJapanGap } from "@/lib/domains/signals/gaps";
import { gapPlaces, type GapSide } from "@/lib/domains/signals/gaps-shared";
import { getFakeDoor, listDoorSignups } from "@/lib/domains/signals/fake-door";
import { DoorEditor, SignupList } from "./door-editor";

export const dynamic = "force-dynamic";
// AI 起草要十几秒，由这一页的 server action 跑
export const maxDuration = 60;

const SIDES: GapSide[] = ["japan", "us", "china"];

/**
 * 假门测试：差距清单里的一条，做一页"准备中的服务"，看陌生人看到价格还愿不愿意留邮箱。
 * 起草（AI）→ 他改、填价格 → 发布拿到链接 → 只数看了几次、留了几个邮箱；留了邮箱的人可以约来聊。
 */
export default async function FakeDoorEditPage({ searchParams }: { searchParams: { signal?: string; side?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const side = SIDES.find((s) => s === searchParams.side);
  const signalId = searchParams.signal ?? "";
  if (!side || !/^[0-9a-f-]{36}$/i.test(signalId)) notFound();

  const [gap, door] = await Promise.all([findJapanGap(user.id, signalId, side), getFakeDoor(user.id, signalId, side)]);
  if (!gap) notFound();
  const { here } = gapPlaces(side);
  const signups = door && door !== "missing-schema" ? await listDoorSignups(user.id, door.id) : [];

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/gaps" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 差距清单
        </Link>
      </p>
      <PageHeader
        eyebrow="Fake door"
        title="假门测试"
        description={`给「${gap.headline}」做一页准备中的服务，写明预计价格，看${here}的陌生人愿不愿意留邮箱。没有人脉时，这是「愿付钱」最近的证据；留了邮箱的人，就是你可以约来聊 15 分钟的人。`}
      />

      {door === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 076 没跑。执行 supabase/migrations/076_signal_fake_doors.sql 之后再来。
        </p>
      ) : (
        <>
          <DoorEditor signalId={signalId} side={side} here={here} door={door} />
          {door && (
            <section className="mt-10">
              <h2 className="text-base font-semibold">留了邮箱的人（{signups.length}）</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                只有你看得到。页面上答应过：只在开始做、或者决定不做的时候联系一次 —— 想约人聊，就在那一次里问一句「方便聊 15 分钟吗」。
                每个登记同时记成一条带「假门登记」标签的观察（不含完整邮箱）。
              </p>
              <SignupList signups={signups} />
            </section>
          )}
          <section className="mt-10 border-t pt-6 text-xs leading-6 text-muted-foreground">
            <h2 className="text-sm font-semibold text-foreground">规矩</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>页面上一定写着「还没有这个服务、现在不收钱、邮箱只联系一次、随时可以取消」—— 这几句由代码加，改不了。</li>
              <li>AI 起草时不许编人数、评价、合作公司；你改的时候也别加。陌生人信的是「诚实地问一句」，不是假装已经有了。</li>
              <li>价格一定要写：不写价格的「想要」，和网上的抱怨差不多。</li>
              <li>不进搜索引擎，只有你把链接贴出去才有人看到。小红书不让放外链，可以放在主页简介里；note 可以直接贴在文末。</li>
              <li>看了几次是页面上的脚本报的（链接预览和爬虫一般不算进去），只数次数，不算转化率。</li>
            </ul>
          </section>
        </>
      )}
    </PageContainer>
  );
}
