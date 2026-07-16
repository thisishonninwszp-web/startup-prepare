"use server";

import { createClient } from "@/lib/supabase/server";
import { getCoreDecisionExport } from "./queries";

export async function exportCoreDecisionData(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const data = await getCoreDecisionExport(user.id);
  return JSON.stringify(data, null, 2);
}
