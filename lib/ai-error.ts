export type SerializedAiError = {
  code: string;
  requestId: string;
  retryable: boolean;
  inputSaved: boolean;
  message: string;
};

const PREFIX = "AI_ERROR:";

export function formatAiErrorMessage(error: SerializedAiError): string {
  return `${PREFIX}${JSON.stringify(error)}`;
}

export function parseAiErrorMessage(message: string): SerializedAiError | null {
  if (!message.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(message.slice(PREFIX.length)) as Partial<SerializedAiError>;
    if (
      typeof parsed.code !== "string" ||
      typeof parsed.requestId !== "string" ||
      typeof parsed.retryable !== "boolean" ||
      typeof parsed.inputSaved !== "boolean" ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }
    return {
      code: parsed.code,
      requestId: parsed.requestId,
      retryable: parsed.retryable,
      inputSaved: parsed.inputSaved,
      message: parsed.message,
    };
  } catch {
    return null;
  }
}

export function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
