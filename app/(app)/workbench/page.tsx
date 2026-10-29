import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReflectionSettings, todayInTimezone } from "@/app/(app)/retrospectives/queries";
import { recommendFrameworks } from "./framework-router";
import { listWorkbenchObjects, signalForObject } from "./queries";
import { WorkbenchObjectCard } from "./workbench-object-card";
import { ConnectedOverview } from "./connected-overview";
import { PageContainer } from "@/components/ui/page-container";
import { ObservationTaskPanel } from "./observation-task-panel";
import { FeedbackImpactPanel } from "./feedback-impact-panel";
import { ReconsiderationCuesPanel } from "./reconsideration-cues-panel";
import { loadReconsiderationCuesAction } from "../ideas/reconsideration-actions";
import { StatisticsPanel } from "./statistics-panel";
import { ProductEventPanel } from "./product-event-panel";
import { SchedulingPanel } from "./scheduling-panel";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const feedbackEnabled = process.env.FEEDBACK_LEARNING_ENABLED === "true";
  const cues = feedbackEnabled ? await loadReconsiderationCuesAction() : null;
  const settings = await getReflectionSettings(user.id);
  const today = todayInTimezone(settings.timezone);
  const objects = await listWorkbenchObjects(user.id, today);
  const dueObjects = objects.filter(
    (object) => object.current_closure?.due_on && object.current_closure.due_on <= today
  );
  const stuckObjects = objects.filter(
    (object) => !object.current_closure || object.current_closure.status === "active"
  ).slice(0, 4);

  return (
    <>
      <PageContainer width="wide">
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Decision workbench
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            决策工作台
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            这里按“正在推进的判断对象”组织系统。工具退到后台，入口变成对象、证据、框架和下一步。
          </p>
        </header>

        {dueObjects.length > 0 && (
          <section className="mb-8 rounded-lg border border-status-validating/30 bg-status-validating/10 p-5">
            <h2 className="text-sm font-medium text-status-validating">
              到期需要对账
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {dueObjects.map((object) => (
                <WorkbenchObjectCard
                  key={`${object.object_type}:${object.object_id}`}
                  object={object}
                  today={today}
                />
              ))}
            </div>
          </section>
        )}

        {stuckObjects.length > 0 && (
          <section className="mb-8 rounded-lg border bg-card p-5">
            <h2 className="text-sm font-medium">可能重复卡住</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {stuckObjects.map((object) => {
                const first = recommendFrameworks({
                  ...signalForObject(object, today),
                  objectId: object.object_id,
                })[0];
                return (
                  <Link
                    key={`${object.object_type}:${object.object_id}:hint`}
                    href={`/workbench/${object.object_type}/${object.object_id}`}
                    className="rounded-lg border bg-background p-4 hover:bg-muted/50"
                  >
                    <p className="text-sm font-medium">{object.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      建议先用：{first.title}。{first.reason}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {process.env.DECISION_OBSERVATIONS_ENABLED === "true" && <div className="mb-8"><ObservationTaskPanel /></div>}
        {feedbackEnabled && <div className="mb-8 space-y-3"><ReconsiderationCuesPanel initialData={cues?.ok ? cues.data : null} /><FeedbackImpactPanel allowTaskAdjustment={process.env.DECISION_OBSERVATIONS_ENABLED === "true"} /></div>}
        {process.env.STATISTICAL_DENOMINATORS_ENABLED === "true" && <div className="mb-8"><StatisticsPanel ideas={objects.filter(o => o.object_type === "idea").map(o => ({id:o.object_id,title:o.title}))} /></div>}
        {process.env.PRODUCT_EVENTS_ENABLED === "true" && <div className="mb-8"><ProductEventPanel ideas={objects.filter(o => o.object_type === "idea").map(o => ({id:o.object_id,title:o.title}))} /></div>}
        {process.env.SCHEDULED_OBSERVATIONS_ENABLED === "true" && process.env.STATISTICAL_DENOMINATORS_ENABLED === "true" && <div className="mb-8"><SchedulingPanel /></div>}
        {process.env.IDEA_EXPERIMENTS_ENABLED === "true" && <section className="mb-8 rounded-lg border bg-card p-5"><h2 className="text-sm font-medium">前提核对与待接触问题 · 仅想法</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">从想法的缺口选择当前资源，查看公开核对、原型运行与仍需问真人的问题；实验完成不表示需求已验证。</p><div className="mt-3 flex flex-wrap gap-3">{objects.filter(o => o.object_type === "idea").map(o => <Link key={o.object_id} href={`/ideas/${o.object_id}#connected-learning`} className="text-xs text-primary underline-offset-4 hover:underline">{o.title} →</Link>)}</div></section>}
        {process.env.IDEA_EXPERIMENTS_ENABLED === "true" && <ConnectedOverview userId={user.id} />}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">全部决策对象</h2>
            <Link
              href="/capture"
              className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
            >
              先捕捉一个新观察
            </Link>
          </div>
          {objects.length === 0 ? (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              还没有可聚合的决策对象。先去捕捉、创建想法或建立现状课题。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {objects.map((object) => (
                <WorkbenchObjectCard
                  key={`${object.object_type}:${object.object_id}`}
                  object={object}
                  today={today}
                />
              ))}
            </div>
          )}
        </section>
      </PageContainer>
    </>
  );
}
