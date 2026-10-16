import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { getPosting } from "@/lib/domains/jobs/postings";
import { getJobProfile } from "@/lib/domains/jobs/profile";
import { getResume } from "@/lib/domains/jobs/resumes";
import { EMPTY_PERSONAL, RESUME_SECTION_KEYS, RESUME_SECTIONS, sectionText, tokyoDate } from "@/lib/domains/jobs/shared";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * A4 打印页：浏览器"打印 → 存成 PDF"。没有导航壳（不在 app/(app) 下）。
 * 姓名、联系方式由代码从条件页的个人信息里填进来 —— 这些从来没发给过 AI。
 */
export default async function ResumePrintPage({ params }: { params: { rid: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.rid)) notFound();
  const resume = await getResume(user.id, params.rid);
  if (!resume) notFound();
  const [posting, profile] = await Promise.all([getPosting(user.id, resume.posting_id), getJobProfile(user.id)]);
  const personal = profile && profile !== "missing-schema" ? profile.personal : EMPTY_PERSONAL;
  const [y, m, d] = tokyoDate().split("-").map(Number);

  // narrow 档是 672px，正好等于 A4 减去两边 16mm 页边距的可打印宽度
  return (
    <PageContainer width="narrow" className="bg-background text-sm leading-7 text-foreground print:p-0">
      <style>{"@page { size: A4; margin: 16mm; }"}</style>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-xs text-muted-foreground">
          {posting ? `${posting.company_name} · ${posting.title}` : ""} · 第 {resume.version} 版
        </p>
        <PrintButton />
      </div>
      <h1 className="text-center text-xl font-semibold">職務経歴書</h1>
      <p className="mt-4 text-right">
        {y}年{m}月{d}日現在
      </p>
      <p className="text-right">
        氏名　{personal.name || "（条件页里还没填）"}
        {personal.kana && `（${personal.kana}）`}
      </p>
      {(personal.email || personal.phone) && (
        <p className="text-right text-xs">{[personal.email, personal.phone].filter(Boolean).join(" / ")}</p>
      )}
      {RESUME_SECTION_KEYS.filter((k) => k !== "motivation").map((key) => (
        <section key={key} className="mt-6 break-inside-avoid">
          <h2 className="border-b border-border pb-1 font-semibold">■ {RESUME_SECTIONS[key]}</h2>
          <p className="mt-2 whitespace-pre-line">{sectionText(key, resume.sections[key])}</p>
        </section>
      ))}
      <p className="mt-6 text-right">以上</p>
      <section className="mt-10 break-before-page">
        <h2 className="border-b border-border pb-1 font-semibold">■ {RESUME_SECTIONS.motivation}</h2>
        <p className="mt-2 whitespace-pre-line">{sectionText("motivation", resume.sections.motivation)}</p>
      </section>
    </PageContainer>
  );
}
