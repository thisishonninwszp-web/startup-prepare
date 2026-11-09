import { describe, expect, it } from "vitest";
import { isAllowedEmail, memberEmails, ownerEmail } from "./members";

describe("members", () => {
  it("open to everyone when nothing is configured", () => {
    expect(isAllowedEmail("anyone@x.com", {})).toBe(true);
  });

  it("open to everyone when the list is configured but members-only is off", () => {
    const env = { IDEAOS_USER_EMAIL: "me@x.com", IDEAOS_MEMBERS: "friend@y.com" };
    expect(isAllowedEmail("stranger@q.com", env)).toBe(true);
    expect(isAllowedEmail("stranger@q.com", { ...env, IDEAOS_MEMBERS_ONLY: "0" })).toBe(true);
  });

  it("members-only with no list configured still lets everyone in", () => {
    expect(isAllowedEmail("anyone@x.com", { IDEAOS_MEMBERS_ONLY: "1" })).toBe(true);
  });

  it("only the owner and listed members once members-only is on", () => {
    const env = {
      IDEAOS_USER_EMAIL: " Me@X.com ",
      IDEAOS_MEMBERS: "friend@y.com，other@z.com  me@x.com",
      IDEAOS_MEMBERS_ONLY: " 1 ",
    };
    expect(ownerEmail(env)).toBe("me@x.com");
    expect(memberEmails(env)).toEqual(["friend@y.com", "other@z.com"]);
    expect(isAllowedEmail("ME@x.com", env)).toBe(true);
    expect(isAllowedEmail("friend@y.com", env)).toBe(true);
    expect(isAllowedEmail("stranger@q.com", env)).toBe(false);
    expect(isAllowedEmail(null, env)).toBe(false);
  });
});
