import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ClipReceiver } from "./clip-receiver";

export const dynamic = "force-dynamic";
// 存的时候 AI 起草、审阅要一会儿
export const maxDuration = 60;

/**
 * 书签小工具打开的那一页：等原来那个网页把正文递过来，看一眼、写一句为什么存，再存进材料箱。
 * 网址和标题从地址栏带过来（递不过来时也能"只存网址"）。
 */
export default function ClipPage({ searchParams }: { searchParams: { url?: string; title?: string } }) {
  const url = typeof searchParams.url === "string" ? searchParams.url : "";
  const title = typeof searchParams.title === "string" ? searchParams.title : "";
  return (
    <PageContainer width="narrow">
      <PageHeader eyebrow="Clip" title="存进材料箱" description="从书签小工具送来的这一页。看一眼对不对，写一句为什么存（可以空着），再存。" />
      <ClipReceiver fallbackUrl={url} fallbackTitle={title} />
    </PageContainer>
  );
}
