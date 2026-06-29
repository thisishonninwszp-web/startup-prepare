import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "./supabase";
import { extractJson } from "./ai-json";

export const AI_MODEL = process.env.AI_MODEL ?? "gemini-2.5-flash";

export type AiErrorCode =
  | "configuration"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "network"
  | "provider_error"
  | "empty_output"
  | "truncated_json"
  | "invalid_json"
  | "schema_violation"
  | "citation_violation"
  | "safety_blocked";

export type AiModule =
  | "capture"
  | "ideas"
  | "reality"
  | "customer_view"
  | "retrospectives"
  | "dreams"
  | "reasoning"
  | "concepts"
  | "unknown";

export type AiCallContext = {
  userId?: string | null;
  operation: string;
  module?: AiModule;
  entityType?: string | null;
  entityId?: string | null;
  promptVersion?: string;
  timeoutMs?: number;
  outputMode?: "text" | "json";
};

export type AiGenerateContentRequest = {
  model?: string;
  contents: unknown;
  config?: Record<string, unknown>;
};

export class AiGatewayError extends Error {
  code: AiErrorCode;
  requestId: string;
  retryable: boolean;
  inputSaved: boolean;

  constructor(input: {
    code: AiErrorCode;
    requestId: string;
    message?: string;
    retryable?: boolean;
    inputSaved?: boolean;
    cause?: unknown;
  }) {
    super(input.message ?? humanAiErrorMessage(input.code), {
      cause: input.cause,
    });
    this.name = "AiGatewayError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.retryable = input.retryable ?? isRetryableAiError(input.code);
    this.inputSaved = input.inputSaved ?? true;
  }
}

const clients = new Map<number, GoogleGenAI>();

function getClient(timeoutMs: number): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env.local.");
  const cached = clients.get(timeoutMs);
  if (cached) return cached;
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      retryOptions: { attempts: 1 },
    },
  });
  clients.set(timeoutMs, client);
  return client;
}

export async function executeAiText(
  context: AiCallContext,
  request: AiGenerateContentRequest
): Promise<string> {
  const startedAt = Date.now();
  const requestId = cryptoRandomId();
  const timeoutMs = context.timeoutMs ?? 30_000;
  const model = request.model ?? AI_MODEL;
  const resolvedContext = {
    ...context,
    userId: context.userId ?? (await getCurrentUserIdSafely()),
  };
  let callId: string | null = null;

  try {
    callId = await safeCreateAiCall({
      requestId,
      context: resolvedContext,
      model,
      request,
      timeoutMs,
    });

    const attemptStarted = Date.now();
    const response = await getClient(timeoutMs).models.generateContent({
      ...request,
      model,
    } as never);
    const text = (response.text ?? "").trim();
    await safeCreateAiAttempt({
      callId,
      attemptNo: 1,
      purpose: "primary",
      durationMs: Date.now() - attemptStarted,
      status: text ? "success" : "failed",
      rawText: text,
      validationErrors: text ? null : ["empty_output"],
    });

    if (!text) {
      throw new AiGatewayError({
        code: "empty_output",
        requestId,
        cause: new Error("AI returned empty output"),
      });
    }

    await safeFinishAiCall({
      callId,
      status: "success",
      durationMs: Date.now() - startedAt,
    });
    return text;
  } catch (error) {
    const gatewayError =
      error instanceof AiGatewayError
        ? error
        : new AiGatewayError({
            code: classifyAiError(error),
            requestId,
            cause: error,
          });
    await safeFinishAiCall({
      callId,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: gatewayError.code,
      errorMessage: gatewayError.message,
    });
    throw gatewayError;
  }
}

export async function executeAiJson<T>(
  context: AiCallContext,
  makeRequest: (attempt: 0 | 1) => AiGenerateContentRequest,
  validate: (value: unknown) => T
): Promise<T> {
  const startedAt = Date.now();
  const requestId = cryptoRandomId();
  const timeoutMs = context.timeoutMs ?? 60_000;
  const firstRequest = makeRequest(0);
  const model = firstRequest.model ?? AI_MODEL;
  const resolvedContext = {
    ...context,
    userId: context.userId ?? (await getCurrentUserIdSafely()),
  };
  let callId: string | null = null;
  let lastError: unknown;

  try {
    callId = await safeCreateAiCall({
      requestId,
      context: { ...resolvedContext, outputMode: "json", timeoutMs },
      model,
      request: firstRequest,
      timeoutMs,
    });

    for (const attempt of [0, 1] as const) {
      const request = makeRequest(attempt);
      const attemptStarted = Date.now();
      let rawText = "";
      try {
        const response = await getClient(timeoutMs).models.generateContent({
          ...request,
          model: request.model ?? model,
        } as never);
        rawText = (response.text ?? "").trim();
        if (!rawText) {
          throw new AiGatewayError({
            code: "empty_output",
            requestId,
            cause: new Error("AI returned empty output"),
          });
        }
        const parsed = extractJson(rawText);
        let value: T;
        try {
          value = validate(parsed);
        } catch (validationError) {
          throw new AiGatewayError({
            code: "schema_violation",
            requestId,
            cause: validationError,
          });
        }
        await safeCreateAiAttempt({
          callId,
          attemptNo: attempt + 1,
          purpose: attempt === 0 ? "primary" : "repair",
          durationMs: Date.now() - attemptStarted,
          status: "success",
          rawText,
          validationErrors: null,
        });
        await safeFinishAiCall({
          callId,
          status: "success",
          durationMs: Date.now() - startedAt,
        });
        return value;
      } catch (error) {
        lastError = error;
        const code = classifyAiError(error);
        await safeCreateAiAttempt({
          callId,
          attemptNo: attempt + 1,
          purpose: attempt === 0 ? "primary" : "repair",
          durationMs: Date.now() - attemptStarted,
          status: "failed",
          rawText,
          validationErrors: [errorMessage(error).slice(0, 1000)],
        });
        if (!shouldAttemptJsonRepair(code, attempt + 1)) {
          throw new AiGatewayError({ code, requestId, cause: error });
        }
      }
    }

    throw new AiGatewayError({
      code: classifyAiError(lastError),
      requestId,
      cause: lastError,
    });
  } catch (error) {
    const gatewayError =
      error instanceof AiGatewayError
        ? error
        : new AiGatewayError({
            code: classifyAiError(error),
            requestId,
            cause: error,
          });
    await safeFinishAiCall({
      callId,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: gatewayError.code,
      errorMessage: gatewayError.message,
    });
    throw gatewayError;
  }
}

export function shouldAttemptJsonRepair(
  code: AiErrorCode,
  attemptNo: number
): boolean {
  return (
    attemptNo === 1 &&
    (code === "invalid_json" ||
      code === "schema_violation" ||
      code === "citation_violation" ||
      code === "truncated_json")
  );
}

export function classifyAiError(error: unknown): AiErrorCode {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("missing gemini_api_key")) return "configuration";
  if (message.includes("api key") || message.includes("unauthorized")) {
    return "authentication";
  }
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("resource exhausted")
  ) {
    return "rate_limit";
  }
  if (
    message.includes("timeout") ||
    message.includes("deadline") ||
    message.includes("aborted")
  ) {
    return "timeout";
  }
  if (message.includes("network") || message.includes("fetch failed")) {
    return "network";
  }
  if (message.includes("truncated")) return "truncated_json";
  if (message.includes("json")) return "invalid_json";
  if (message.includes("citation")) return "citation_violation";
  if (message.includes("schema") || message.includes("验证")) {
    return "schema_violation";
  }
  if (message.includes("safety")) return "safety_blocked";
  return "provider_error";
}

export function sanitizeAiPayload(value: unknown): unknown {
  return sanitizeValue(value);
}

export function encryptAiPayloadForTest(value: unknown, base64Key: string): string {
  return encryptPayload(value, base64Key);
}

export function decryptAiPayloadForTest(payload: string, base64Key: string): unknown {
  return decryptPayload(payload, base64Key);
}

export function decryptAiPayload(payload: string): unknown {
  const key = getLogKey();
  if (!key) throw new Error("Missing AI_LOG_ENCRYPTION_KEY.");
  return decryptPayload(payload, key);
}

export function hasAiLogEncryptionKey(): boolean {
  return Boolean(getLogKey());
}

export function humanAiErrorMessage(code: AiErrorCode): string {
  switch (code) {
    case "configuration":
      return "AI 配置缺失，请检查环境变量。";
    case "authentication":
      return "AI 鉴权失败，请检查 API Key。";
    case "rate_limit":
      return "AI 服务当前限流，请稍后重试。";
    case "timeout":
      return "AI 响应超时，本次输入已保留。";
    case "network":
      return "AI 网络请求失败，本次输入已保留。";
    case "empty_output":
      return "AI 没有返回内容，请重试。";
    case "truncated_json":
    case "invalid_json":
    case "schema_violation":
    case "citation_violation":
      return "AI 返回了无法验证的结构，请重试。";
    case "safety_blocked":
      return "AI 请求被安全策略拦截。";
    default:
      return "AI 服务返回错误，请重试。";
  }
}

function isRetryableAiError(code: AiErrorCode): boolean {
  return code === "timeout" || code === "network" || code === "rate_limit";
}

function cryptoRandomId(): string {
  return `ai_${randomBytes(9).toString("base64url")}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message} ${error.cause ? errorMessage(error.cause) : ""}`;
  }
  return String(error);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("authorization") ||
      normalized.includes("cookie") ||
      normalized.includes("api_key") ||
      normalized.includes("apikey") ||
      normalized.includes("x-api-key") ||
      normalized.includes("token") ||
      normalized.includes("secret")
    ) {
      out[key] = "[redacted]";
    } else {
      out[key] = sanitizeValue(item);
    }
  }
  return out;
}

function getLogKey(): string | null {
  return process.env.AI_LOG_ENCRYPTION_KEY ?? null;
}

function encryptPayload(value: unknown, base64Key: string): string {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("AI_LOG_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const compressed = gzipSync(Buffer.from(JSON.stringify(sanitizeValue(value))));
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decryptPayload(payload: string, base64Key: string): unknown {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("AI_LOG_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  }
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
}

function maybeEncrypt(value: unknown): { encrypted?: string; metadataOnly: boolean } {
  const key = getLogKey();
  if (!key) return { metadataOnly: true };
  const json = JSON.stringify(sanitizeValue(value));
  if (Buffer.byteLength(json, "utf8") > 2 * 1024 * 1024) {
    return { metadataOnly: true };
  }
  try {
    return { encrypted: encryptPayload(value, key), metadataOnly: false };
  } catch {
    return { metadataOnly: true };
  }
}

async function safeCreateAiCall(input: {
  requestId: string;
  context: AiCallContext;
  model: string;
  request: AiGenerateContentRequest;
  timeoutMs: number;
}): Promise<string | null> {
  try {
    const encrypted = maybeEncrypt({
      request: input.request,
      context: input.context,
    });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("ai_calls")
      .insert({
        request_id: input.requestId,
        user_id: input.context.userId ?? null,
        operation: input.context.operation,
        module: input.context.module ?? "unknown",
        entity_type: input.context.entityType ?? null,
        entity_id: input.context.entityId ?? null,
        prompt_version: input.context.promptVersion ?? "v1",
        model: input.model,
        output_mode: input.context.outputMode ?? "text",
        timeout_ms: input.timeoutMs,
        status: "running",
        encrypted_request_payload: encrypted.encrypted ?? null,
        request_metadata_only: encrypted.metadataOnly,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function safeCreateAiAttempt(input: {
  callId: string | null;
  attemptNo: number;
  purpose: "primary" | "repair";
  durationMs: number;
  status: "success" | "failed";
  rawText: string;
  validationErrors: string[] | null;
}) {
  if (!input.callId) return;
  try {
    const encrypted = maybeEncrypt({
      rawText: input.rawText,
      validationErrors: input.validationErrors,
    });
    await supabaseAdmin.from("ai_call_attempts").insert({
      ai_call_id: input.callId,
      attempt_no: input.attemptNo,
      purpose: input.purpose,
      status: input.status,
      duration_ms: input.durationMs,
      encrypted_response_payload: encrypted.encrypted ?? null,
      response_metadata_only: encrypted.metadataOnly,
      validation_errors: input.validationErrors,
    });
  } catch {
    // Diagnostic logging must not affect the user-facing AI operation.
  }
}

async function safeFinishAiCall(input: {
  callId: string | null;
  status: "success" | "failed";
  durationMs: number;
  errorCode?: AiErrorCode;
  errorMessage?: string;
}) {
  if (!input.callId) return;
  try {
    await supabaseAdmin
      .from("ai_calls")
      .update({
        status: input.status,
        duration_ms: input.durationMs,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", input.callId);
  } catch {
    // Diagnostic logging must not affect the user-facing AI operation.
  }
}

async function getCurrentUserIdSafely(): Promise<string | null> {
  try {
    const { createClient } = await import("./supabase/server");
    const {
      data: { user },
    } = await createClient().auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
