import { describe, expect, it } from "vitest";

describe("reasoning idea ownership", () => {
  it("allows no link or the current user's idea owner", async () => {
    const validation = await import("./validation");
    const assertOwner = (
      validation as typeof validation & {
        assertLinkedIdeaOwner?: (
          linkedOwnerId: string | null,
          userId: string
        ) => void;
      }
    ).assertLinkedIdeaOwner;

    expect(typeof assertOwner).toBe("function");
    expect(() => assertOwner?.(null, "user-1")).not.toThrow();
    expect(() => assertOwner?.("user-1", "user-1")).not.toThrow();
  });

  it("rejects linking another user's idea", async () => {
    const validation = await import("./validation");
    const assertOwner = (
      validation as typeof validation & {
        assertLinkedIdeaOwner?: (
          linkedOwnerId: string | null,
          userId: string
        ) => void;
      }
    ).assertLinkedIdeaOwner;

    expect(typeof assertOwner).toBe("function");
    expect(() => assertOwner?.("user-2", "user-1")).toThrow("无权关联");
  });
});
