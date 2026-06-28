export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const json =
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(json);
}

export async function generateValidatedJson<T>(
  generate: (attempt: 0 | 1) => Promise<string>,
  validate: (value: unknown) => T
): Promise<T> {
  let lastError: unknown;
  for (const attempt of [0, 1] as const) {
    try {
      return validate(extractJson(await generate(attempt)));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("AI返回了无法验证的结构，请重试。", {
    cause: lastError,
  });
}
