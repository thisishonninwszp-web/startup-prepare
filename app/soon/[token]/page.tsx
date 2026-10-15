import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicDoor } from "@/lib/domains/signals/fake-door";
import { DoorView } from "./door-view";

export const dynamic = "force-dynamic";

type Props = { params: { token: string } };

// 他自己把链接贴出去才有人看到；不进搜索引擎
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const door = await loadPublicDoor(params.token);
  return { title: door?.content.title ?? "準備中", robots: { index: false, follow: false } };
}

/**
 * 假门测试的公开页：一样还没有的服务，写明预计价格，留邮箱"做出来了告诉我"。
 * 不用登录，口令对不上就是 404。"还没有这个服务、现在不收钱、邮箱只联系一次"由代码加，AI 和他都改不了。
 */
export default async function FakeDoorPage({ params }: Props) {
  const door = await loadPublicDoor(params.token);
  if (!door) notFound();
  return <DoorView token={params.token} door={door} />;
}
