import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileData } from "./queries";
import { ProfileReport } from "./profile-report";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const data = await getProfileData(user.id);

  const hasEnoughData =
    data.stats.total_ideas >= 5 || data.stats.total_validations >= 3;

  const totalContent =
    data.idea_snapshots.length +
    data.dream_snapshots.length +
    data.decision_learned.length +
    data.validation_notes.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">创业者档案</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI 从你在 IdeaOS 中留下的全部痕迹，推断你是什么样的人。
        </p>
      </div>

      {/* 数据来源概览 */}
      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "想法记录", value: data.stats.total_ideas },
          { label: "验证记录", value: data.stats.total_validations },
          { label: "梦想场景", value: data.dream_snapshots.length },
          { label: "重构课题", value: data.reframing_topics.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card px-4 py-3 space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {totalContent > 0 && (
        <p className="mb-6 text-xs text-muted-foreground">
          档案基于 {totalContent} 条内容记录推断，包含想法标题、梦想描述、验证笔记和决策复盘。
          内容越丰富，推断越准确。
        </p>
      )}

      <ProfileReport hasEnoughData={hasEnoughData} />
    </div>
  );
}
