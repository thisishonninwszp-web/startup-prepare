import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCanvas } from "../queries";
import { CanvasWorkspace } from "./canvas-workspace";

export const dynamic = "force-dynamic";

export default async function CanvasPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const canvas = await getCanvas(params.id, userId);
  if (!canvas) notFound();

  return <CanvasWorkspace canvas={canvas} />;
}
