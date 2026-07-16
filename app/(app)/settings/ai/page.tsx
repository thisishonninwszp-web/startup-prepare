import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { decryptAiPayload, hasAiLogEncryptionKey } from "@/lib/ai-gateway";
import { Button } from "@/components/ui/button";

type AiCallRow = {
  id: string;
  request_id: string;
  operation: string;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  model: string;
  output_mode: "text" | "json";
  status: "running" | "success" | "failed";
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  encrypted_request_payload: string | null;
  request_metadata_only: boolean;
  created_at: string;
  expires_at: string;
  ai_call_attempts?: Array<{
    id: string;
    attempt_no: number;
    purpose: "primary" | "repair";
    status: "success" | "failed";
    duration_ms: number | null;
    encrypted_response_payload: string | null;
    response_metadata_only: boolean;
    validation_errors: string[] | null;
    created_at: string;
  }>;
};

async function deleteAiCall(formData: FormData) {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabaseAdmin.from("ai_calls").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings/ai");
}

async function deleteAllAiCalls() {
  "use server";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin.from("ai_calls").delete().eq("user_id", user.id);
  revalidatePath("/settings/ai");
}

function tryDecrypt(payload: string | null): unknown {
  if (!payload || !hasAiLogEncryptionKey()) return null;
  try {
    return decryptAiPayload(payload);
  } catch {
    return { error: "解密失败：密钥不匹配或日志已损坏。" };
  }
}

function JsonBlock({ value }: { value: unknown }) {
  if (!value) {
    return <p className="text-xs text-muted-foreground">无可显示内容。</p>;
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function AiSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await supabaseAdmin
    .from("ai_calls")
    .select(
      "id,request_id,operation,module,entity_type,entity_id,model,output_mode,status,error_code,error_message,duration_ms,encrypted_request_payload,request_metadata_only,created_at,expires_at,ai_call_attempts(id,attempt_no,purpose,status,duration_ms,encrypted_response_payload,response_metadata_only,validation_errors,created_at)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回首页
        </Link>
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <h1 className="text-lg font-semibold">AI 诊断不可用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            读取 ai_calls 失败。通常是 015 迁移还没运行，或 Vercel/Supabase
            schema cache 尚未刷新。
          </p>
          <p className="mt-3 font-mono text-xs text-destructive">
            {result.error.message}
          </p>
        </div>
      </main>
    );
  }

  const rows = (result.data ?? []) as AiCallRow[];
  const counts = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] += 1;
      return acc;
    },
    { total: 0, running: 0, success: 0, failed: 0 }
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← 返回首页
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">AI 诊断</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            用于排查 AI 失败。这里显示最近 50 次调用，日志默认 30 天过期。不会在这里重放请求。
          </p>
        </div>
        <form action={deleteAllAiCalls}>
          <Button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <Trash2 className="size-4" />
            删除全部日志
          </Button>
        </form>
      </div>

      {!hasAiLogEncryptionKey() && (
        <div className="mt-5 flex gap-3 rounded-lg border border-status-validating/30/40 bg-status-validating/10 p-4 text-sm text-status-validating">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">未配置 AI_LOG_ENCRYPTION_KEY</p>
            <p className="mt-1">
              AI 调用仍会运行，但诊断页只能看到元数据，无法保存或解密完整请求/响应。
            </p>
          </div>
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["总数", counts.total],
          ["成功", counts.success],
          ["失败", counts.failed],
          ["运行中", counts.running],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </section>

      <section className="mt-6 space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
            还没有 AI 调用日志。
          </div>
        ) : (
          rows.map((row) => {
            const requestPayload = tryDecrypt(row.encrypted_request_payload);
            return (
              <details key={row.id} className="rounded-lg border bg-card p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{row.request_id}</span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px]">
                          {row.status}
                        </span>
                        {row.error_code && (
                          <span className="rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive">
                            {row.error_code}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.module} / {row.operation} · {row.output_mode} ·{" "}
                        {new Date(row.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{row.duration_ms ?? "-"} ms</span>
                      <form action={deleteAiCall}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button className="rounded-md border px-2 py-1 hover:bg-muted">
                          删除
                        </Button>
                      </form>
                    </div>
                  </div>
                </summary>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h2 className="mb-2 text-sm font-medium">请求</h2>
                    <JsonBlock
                      value={
                        row.request_metadata_only
                          ? { note: "payload 超限或未配置密钥，仅保存元数据。" }
                          : requestPayload
                      }
                    />
                  </div>
                  <div>
                    <h2 className="mb-2 text-sm font-medium">错误</h2>
                    <JsonBlock
                      value={
                        row.error_code
                          ? { code: row.error_code, message: row.error_message }
                          : { status: row.status }
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <h2 className="text-sm font-medium">尝试记录</h2>
                  {(row.ai_call_attempts ?? [])
                    .sort((a, b) => a.attempt_no - b.attempt_no)
                    .map((attempt) => (
                      <div key={attempt.id} className="rounded-lg border p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>#{attempt.attempt_no}</span>
                          <span>{attempt.purpose}</span>
                          <span>{attempt.status}</span>
                          <span>{attempt.duration_ms ?? "-"} ms</span>
                        </div>
                        <JsonBlock
                          value={
                            attempt.response_metadata_only
                              ? {
                                  note: "payload 超限或未配置密钥，仅保存元数据。",
                                  validation_errors: attempt.validation_errors,
                                }
                              : tryDecrypt(attempt.encrypted_response_payload)
                          }
                        />
                      </div>
                    ))}
                </div>
              </details>
            );
          })
        )}
      </section>
    </main>
  );
}
