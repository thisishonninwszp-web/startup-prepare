import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CORE_PAGE_FILES = [
  "app/(app)/capture/page.tsx",
  "app/(app)/dashboard/page.tsx",
  "app/(app)/ideas/page.tsx",
  "app/(app)/ideas/[id]/page.tsx",
  "app/(app)/learnings/page.tsx",
];

describe("core page database error handling", () => {
  it.each(CORE_PAGE_FILES)(
    "%s does not discard Supabase query errors",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /const\s+\{\s*data(?::\s*\w+)?\s*\}\s*=\s*await\s+supabaseAdmin/
      );
    }
  );
});
