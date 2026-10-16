import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getJobProfile, MISSING_MIGRATION } from "@/lib/domains/jobs/profile";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function JobProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const profile = await getJobProfile(user.id);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/jobs" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 求职
        </Link>
      </p>
      <PageHeader
        title="条件"
        description="每天搜什么岗位、年收跟现在差多少，都按这里写的来。最下面的个人信息只在打印简历时填进去，不会发给 AI。"
      />
      {profile === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_MIGRATION}</p>
      ) : (
        <ProfileForm profile={profile} />
      )}
    </PageContainer>
  );
}
