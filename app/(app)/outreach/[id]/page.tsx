import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCanvas } from "../queries";
import { CanvasWorkspace } from "./canvas-workspace";
import { FeedbackImpactPanel } from "../../workbench/feedback-impact-panel";

export const dynamic = "force-dynamic";

export default async function CanvasPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const canvas = await getCanvas(params.id, userId);
  if (!canvas) notFound();

  return <><CanvasWorkspace canvas={canvas} />{process.env.FEEDBACK_LEARNING_ENABLED === "true" && canvas.source_type === "idea" && canvas.source_id && <div className="mx-auto mb-8 max-w-3xl px-4"><FeedbackImpactPanel ideaId={canvas.source_id} outreachCanvasId={canvas.id} allowTaskAdjustment={process.env.DECISION_OBSERVATIONS_ENABLED === "true"} /></div>}</>;
}
