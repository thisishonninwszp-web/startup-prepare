import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reasoning database reads", () => {
  it.each(["app/(app)/reasoning/actions.ts", "app/(app)/reasoning/queries.ts"])(
    "%s never treats a failed read as an empty result",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /const\s+\{\s*data(?::\s*\w+)?\s*\}\s*=\s*await\s+supabaseAdmin/
      );
    }
  );
});
