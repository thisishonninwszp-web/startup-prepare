import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const schemaLimit = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: schemaLimit,
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
    schemaLimit.mockReset();
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

describe("concept schema capability", () => {
  it("reports an unavailable optional schema without throwing", async () => {
    schemaLimit.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST205",
        message:
          "Could not find the table 'public.concept_workspaces' in the schema cache",
      },
    });
    const queries = await import("./queries");
    const getStatus = (
      queries as typeof queries & {
        getConceptSchemaStatus?: () => Promise<boolean>;
      }
    ).getConceptSchemaStatus;

    expect(typeof getStatus).toBe("function");
    await expect(getStatus?.()).resolves.toBe(false);
  });

  it("reports the concept schema as available when the probe succeeds", async () => {
    schemaLimit.mockResolvedValue({ data: [], error: null });
    const queries = await import("./queries");
    const getStatus = (
      queries as typeof queries & {
        getConceptSchemaStatus?: () => Promise<boolean>;
      }
    ).getConceptSchemaStatus;

    expect(typeof getStatus).toBe("function");
    await expect(getStatus?.()).resolves.toBe(true);
  });
});
