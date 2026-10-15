import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { DOOR_TEXT, loadSignupForCancel } from "@/lib/domains/signals/fake-door";
import { CancelSignupButton } from "./cancel-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "取り消し / 取消登记", robots: { index: false, follow: false } };

/** 登记的人自己取消：点一下，邮箱和那条观察一起删掉。链接对不上就是 404。 */
export default async function CancelSignupPage({ params }: { params: { cancelToken: string } }) {
  const signup = await loadSignupForCancel(params.cancelToken);
  if (!signup) notFound();
  const t = DOOR_TEXT[signup.lang];
  return (
    <PageContainer width="narrow">
      <div lang={signup.lang === "ja" ? "ja" : "zh-CN"} className="py-12">
        <h1 className="text-2xl font-semibold">{t.cancelTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{signup.title}</p>
        <p className="mt-6 text-sm leading-7">{t.cancelLead}</p>
        <div className="mt-6">
          <CancelSignupButton cancelToken={params.cancelToken} lang={signup.lang} />
        </div>
      </div>
    </PageContainer>
  );
}
