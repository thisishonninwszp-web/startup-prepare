"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfileData } from "./queries";
import { generatePersonalProfile } from "@/lib/ai";
import type { PersonalProfileReport } from "@/lib/ai";

export type { PersonalProfileReport };

export async function runProfileGeneration(): Promise<PersonalProfileReport> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const data = await getProfileData(user.id);
  return generatePersonalProfile(data);
}
