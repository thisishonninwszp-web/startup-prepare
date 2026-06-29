import { jsonrepair } from "jsonrepair";

function isCompleteJsonContainer(json: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth < 0) return false;
    }
  }

  return !inString && depth === 0;
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0) throw new Error("AI output did not contain a JSON object");
  const json =
    end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
  try {
    return JSON.parse(json);
  } catch (error) {
    if (!isCompleteJsonContainer(json)) {
      throw new Error("AI JSON was truncated", { cause: error });
    }
    return JSON.parse(jsonrepair(json));
  }
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
