import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "./supabase";
import { extractJson } from "./ai-json";
import { formatAiErrorMessage } from "./ai-error";

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
  | "business_plans"
  | "self"
  | "jobs"
  | "unknown";

export type AiPayloadLogging = "encrypted" | "metadata_only";

export type AiCallContext = {
  userId?: string | null;
  operation: string;
  module?: AiModule;
  entityType?: string | null;
  entityId?: string | null;
  promptVersion?: string;
  timeoutMs?: number;
  outputMode?: "text" | "json";
  payloadLogging?: AiPayloadLogging;
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
    const message = input.message ?? humanAiErrorMessage(input.code);
    const retryable = input.retryable ?? isRetryableAiError(input.code);
    const inputSaved = input.inputSaved ?? true;
    super(
      formatAiErrorMessage({
        code: input.code,
        requestId: input.requestId,
        retryable,
        inputSaved,
        message,
      }),
      {
      cause: input.cause,
      }
    );
    this.name = "AiGatewayError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.retryable = retryable;
    this.inputSaved = inputSaved;
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
  return executeAiCall(context, request, (_response, text) => text);
}

/** Google 搜索找到的一篇网页（链接是 Google 的跳转地址，要跟一次跳转才是原网页）。 */
export type GroundedSource = { uri: string; title: string };

/**
 * 让模型带着 Google 搜索回答，只取它找到的来源链接，不要它写的那段话 ——
 * 原文由调用方自己去抓、自己核对（AI 的总结没法逐字核对）。
 */
export async function executeAiGroundedSearch(
  context: AiCallContext,
  request: AiGenerateContentRequest
): Promise<GroundedSource[]> {
  return executeAiCall(context, request, (response) => {
    const chunks = (response as { candidates?: { groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] })
      .candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    return chunks
      .map((c) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? "" }))
      .filter((c) => c.uri && !seen.has(c.uri) && seen.add(c.uri));
  });
}

/** 「意思的指纹」用的模型和维度（外部信号的记忆层；迁移 091 的列是 768 维）。 */
export const EMBED_MODEL = process.env.AI_EMBED_MODEL ?? "gemini-embedding-001";
export const EMBED_DIMENSIONS = 768;
const EMBED_BATCH = 50;

/**
 * 算一批文字的指纹（向量）。document = 存进去的新闻，query = 他要找的那句话（两种算法略有不同，配对用效果更好）。
 * 量大（每天几百条），不写进 ai_calls 日志；出错照样包成 AiGatewayError。按 50 条一批发。
 */
export async function executeEmbedding(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  const requestId = randomBytes(6).toString("hex");
  const out: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH).map((t) => t.slice(0, 2000) || " ");
      const response = await getClient(30_000).models.embedContent({
        model: EMBED_MODEL,
        contents: batch,
        config: { outputDimensionality: EMBED_DIMENSIONS, taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY" },
      });
      const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBED_DIMENSIONS)) {
        throw new Error("embedding schema: 返回的条数或维度不对");
      }
      out.push(...vectors);
    }
    return out;
  } catch (error) {
    if (error instanceof AiGatewayError) throw error;
    const code = classifyAiError(error);
    throw new AiGatewayError({ code, requestId, retryable: code === "rate_limit" || code === "timeout" || code === "network", cause: error });
  }
}

type InlineImage = { mimeType: string; data: string };

function firstImage(response: unknown): InlineImage | null {
  const parts =
    (response as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] }).candidates?.[0]?.content
      ?.parts ?? [];
  const hit = parts.find((p) => p.inlineData?.data);
  return hit?.inlineData?.data ? { mimeType: hit.inlineData.mimeType ?? "image/png", data: hit.inlineData.data } : null;
}

/** 出图（Gemini 的图片模型）：返回第一张图的字节。日志里只记"一张图、多大"，不存图本身。 */
export async function executeAiImage(context: AiCallContext, request: AiGenerateContentRequest): Promise<{ mimeType: string; data: Buffer }> {
  return executeAiCall(
    context,
    request,
    (response) => {
      const image = firstImage(response)!;
      return { mimeType: image.mimeType, data: Buffer.from(image.data, "base64") };
    },
    (response) => {
      const image = firstImage(response);
      return image ? `[image ${image.mimeType} ${Math.round((image.data.length * 3) / 4)} bytes]` : "";
    }
  );
}

/** 一次 AI 调用：记日志、处理空输出和错误；read 从原始响应里取调用方要的东西。 */
async function executeAiCall<T>(
  context: AiCallContext,
  request: AiGenerateContentRequest,
  read: (response: unknown, text: string) => T,
  /** 从响应里取"有没有输出"的那段文字（记日志用、空了就当失败）；出图时是一句"一张图、多大"。 */
  output: (response: unknown) => string = (response) => ((response as { text?: string }).text ?? "").trim()
): Promise<T> {
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
    const text = output(response);
    await safeCreateAiAttempt({
      callId,
      attemptNo: 1,
      purpose: "primary",
      durationMs: Date.now() - attemptStarted,
      status: text ? "success" : "failed",
      rawText: text,
      validationErrors: text ? null : ["empty_output"],
      errorCode: text ? null : "empty_output",
      payloadLogging: resolvedContext.payloadLogging,
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
    return read(response, text);
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
          errorCode: null,
          payloadLogging: resolvedContext.payloadLogging,
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
          errorCode: code,
          payloadLogging: resolvedContext.payloadLogging,
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

// ---------------------------------------------------------------------------
// Jev（TypeSafe System One）：只做判断的模型，返回档位与概率，不生成文字。
// 目前只有 /self 的写法画像在用；它的数字原样展示，规则见 CLAUDE.md 原则 1 例外二。
// ---------------------------------------------------------------------------

export const JEV_MODEL = process.env.JEV_MODEL ?? "jev-1.13.0";
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export type JevQuestion =
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevRequest = {
  /** 被判断的材料：一段文字。 */
  state: string;
  questions: Record<string, JevQuestion>;
};

export type JevResult = {
  model: string;
  answers: Record<string, unknown>;
  usage: { input_tokens: number; output_tokens: number };
};

export async function executeJev<T>(
  context: AiCallContext,
  request: JevRequest,
  validate: (result: JevResult) => T,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const startedAt = Date.now();
  const requestId = cryptoRandomId();
  const timeoutMs = context.timeoutMs ?? 45_000;
  const resolvedContext = {
    ...context,
    userId: context.userId ?? (await getCurrentUserIdSafely()),
  };
  let callId: string | null = null;

  try {
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) {
      throw new AiGatewayError({
        code: "configuration",
        requestId,
        message: "缺少 JEV_API_KEY，请在 .env.local 里填上 TypeSafe 的 Key。",
      });
    }

    callId = await safeCreateAiCall({
      requestId,
      context: { ...resolvedContext, outputMode: "json", timeoutMs },
      model: JEV_MODEL,
      request: { model: JEV_MODEL, contents: request },
      timeoutMs,
    });

    const attemptStarted = Date.now();
    let rawText = "";
    try {
      const response = await fetchImpl(JEV_ENDPOINT, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...request, model: JEV_MODEL }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        // 不读响应体：可能回显 Key 或原文。
        await response.body?.cancel();
        throw jevHttpError(response.status, requestId);
      }
      rawText = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch (cause) {
        throw new AiGatewayError({ code: "invalid_json", requestId, cause });
      }
      let value: T;
      try {
        value = validate(parseJevResult(parsed));
      } catch (cause) {
        throw new AiGatewayError({ code: "schema_violation", requestId, cause });
      }
      await safeCreateAiAttempt({
        callId,
        attemptNo: 1,
        purpose: "primary",
        durationMs: Date.now() - attemptStarted,
        status: "success",
        rawText,
        validationErrors: null,
        errorCode: null,
        payloadLogging: resolvedContext.payloadLogging,
      });
      await safeFinishAiCall({
        callId,
        status: "success",
        durationMs: Date.now() - startedAt,
      });
      return value;
    } catch (error) {
      const code =
        error instanceof AiGatewayError ? error.code : classifyAiError(error);
      await safeCreateAiAttempt({
        callId,
        attemptNo: 1,
        purpose: "primary",
        durationMs: Date.now() - attemptStarted,
        status: "failed",
        rawText,
        validationErrors: [errorMessage(error).slice(0, 1000)],
        errorCode: code,
        payloadLogging: resolvedContext.payloadLogging,
      });
      throw error;
    }
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

export function parseJevResult(value: unknown): JevResult {
  if (!value || typeof value !== "object") throw new Error("Jev 返回不是对象");
  const record = value as Record<string, unknown>;
  const usage = record.usage as Record<string, unknown> | undefined;
  if (typeof record.model !== "string" || !record.model) {
    throw new Error("Jev 返回缺少 model");
  }
  if (!record.answers || typeof record.answers !== "object") {
    throw new Error("Jev 返回缺少 answers");
  }
  return {
    model: record.model,
    answers: record.answers as Record<string, unknown>,
    usage: {
      input_tokens: Number(usage?.input_tokens) || 0,
      output_tokens: Number(usage?.output_tokens) || 0,
    },
  };
}

function jevHttpError(status: number, requestId: string): AiGatewayError {
  const known: Record<number, [AiErrorCode, string]> = {
    401: ["authentication", "Jev 的 Key 无效或过期了，换一个填进 JEV_API_KEY。"],
    402: ["provider_error", "TypeSafe 账户额度用完了，去控制台看一眼余额。"],
    403: ["authentication", "这个 Key 没有调用 Jev 的权限。"],
    413: ["provider_error", "这次送去的文字太长了。"],
    429: ["rate_limit", "Jev 那边限流了，过一会儿再试。"],
  };
  const [code, message] = known[status] ?? [
    "provider_error",
    `Jev 暂时不可用（HTTP ${status}），稍后再试。`,
  ];
  return new AiGatewayError({
    code,
    requestId,
    message,
    cause: new Error(`HTTP ${status}`),
  });
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

export function shouldStoreAiPayload(
  mode: AiPayloadLogging | undefined
): boolean {
  return mode !== "metadata_only";
}

export function selectAiValidationErrors(
  mode: AiPayloadLogging | undefined,
  validationErrors: string[] | null,
  errorCode: AiErrorCode | null
): string[] | null {
  if (mode !== "metadata_only") return validationErrors;
  return errorCode ? [errorCode] : null;
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
    const encrypted: { encrypted?: string; metadataOnly: boolean } =
      shouldStoreAiPayload(input.context.payloadLogging)
        ? maybeEncrypt({
            request: input.request,
            context: input.context,
          })
        : { metadataOnly: true };
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
  errorCode: AiErrorCode | null;
  payloadLogging?: AiPayloadLogging;
}) {
  if (!input.callId) return;
  try {
    const validationErrors = selectAiValidationErrors(
      input.payloadLogging,
      input.validationErrors,
      input.errorCode
    );
    const encrypted: { encrypted?: string; metadataOnly: boolean } =
      shouldStoreAiPayload(input.payloadLogging)
        ? maybeEncrypt({
            rawText: input.rawText,
            validationErrors,
          })
        : { metadataOnly: true };
    await supabaseAdmin.from("ai_call_attempts").insert({
      ai_call_id: input.callId,
      attempt_no: input.attemptNo,
      purpose: input.purpose,
      status: input.status,
      duration_ms: input.durationMs,
      encrypted_response_payload: encrypted.encrypted ?? null,
      response_metadata_only: encrypted.metadataOnly,
      validation_errors: validationErrors,
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
