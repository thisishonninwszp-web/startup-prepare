import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle,
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@/app/dreams/queries", () => ({
  listDreamVersionChoices: vi.fn(),
}));

import { getIdeaConceptSummary } from "./queries";

describe("getIdeaConceptSummary schema compatibility", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("returns null when the optional concept workspace table is not migrated", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST205",
        message:
          "Could not find the table 'public.concept_workspaces' in the schema cache",
      },
    });

    await expect(getIdeaConceptSummary("idea-1", "user-1")).resolves.toBeNull();
  });

  it("does not hide unrelated database errors", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table concept_workspaces",
      },
    });

    await expect(getIdeaConceptSummary("idea-1", "user-1")).rejects.toThrow(
      "permission denied"
    );
  });
});
