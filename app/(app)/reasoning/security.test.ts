import { describe, expect, it } from "vitest";
import {
  normalizeCreateBayesianBelief,
  normalizeCreateFermiEstimate,
  normalizeCreateReframingSession,
} from "./validation";

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

describe("reasoning reality source input", () => {
  it("normalizes an optional reality version for every reasoning tool", () => {
    expect(
      normalizeCreateBayesianBelief({
        question: "判断",
        reality_version_id: "version-1",
      }).reality_version_id
    ).toBe("version-1");
    expect(
      normalizeCreateFermiEstimate({
        question: "估算",
        category: "market",
        reality_version_id: "version-1",
      }).reality_version_id
    ).toBe("version-1");
    expect(
      normalizeCreateReframingSession({
        topic_text: "课题",
        reality_version_id: "version-1",
      }).reality_version_id
    ).toBe("version-1");
  });
});
