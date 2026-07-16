import { describe, expect, it } from "vitest";

describe("capture promotion metadata", () => {
  it("creates stable internal markers and hides them from user tags", async () => {
    const domain = await import("../ideas/types");
    const api = domain as typeof domain & {
      observationSourceTag?: (id: string) => string;
      isObservationPromoted?: (tags: string[]) => boolean;
      visibleTags?: (tags: string[]) => string[];
      OBSERVATION_PROMOTED_TAG?: string;
    };

    expect(typeof api.observationSourceTag).toBe("function");
    expect(typeof api.isObservationPromoted).toBe("function");
    expect(typeof api.visibleTags).toBe("function");
    expect(api.OBSERVATION_PROMOTED_TAG).toBeTruthy();

    const source = api.observationSourceTag?.("obs-1") ?? "";
    const tags = ["客户抱怨", source, api.OBSERVATION_PROMOTED_TAG ?? ""];
    expect(api.isObservationPromoted?.(tags)).toBe(true);
    expect(api.visibleTags?.(tags)).toEqual(["客户抱怨"]);
  });
});
