"use server";

import { createClient } from "@/lib/supabase/server";
import { AiGatewayError, humanAiErrorMessage } from "@/lib/ai-gateway";
import { advanceChinaRun, retryChinaCompanies, startChinaRun } from "@/lib/domains/jobs/china";
import type { ChinaRunStatus } from "@/lib/domains/jobs/china-shared";

type Fail = { ok: false; message: string };
type Result<T extends object = object> = ({ ok: true } & T) | Fail;

const UUID = /^[0-9a-f-]{36}$/i;

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  return user.id;
}

function errorMessage(error: unknown): string {
  if (error instanceof AiGatewayError) return humanAiErrorMessage(error.code);
  return error instanceof Error ? error.message : "うまくいきませんでした";
}

/** 新开一次：写好搜索词、存一行，返回 id（页面跳到结果页，在那里接着跑）。 */
export async function startChinaRunAction(business: string): Promise<Result<{ id: string }>> {
  const userId = await requireUserId();
  try {
    return { ok: true, id: await startChinaRun(userId, business) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/** 接着跑下一步（一步一个请求）。 */
export async function advanceChinaRunAction(id: string): Promise<Result<{ status: ChinaRunStatus }>> {
  const userId = await requireUserId();
  if (!UUID.test(id)) return { ok: false, message: "この記録は見つかりませんでした。" };
  try {
    return { ok: true, status: await advanceChinaRun(userId, id) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/** 一家都没找到时再找一次。 */
export async function retryChinaCompaniesAction(id: string): Promise<Result> {
  const userId = await requireUserId();
  if (!UUID.test(id)) return { ok: false, message: "この記録は見つかりませんでした。" };
  try {
    await retryChinaCompanies(userId, id);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}
