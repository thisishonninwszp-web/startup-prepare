import { describe, expect, it } from "vitest";
import { isAllowedEmail, memberEmails, ownerEmail } from "./members";

describe("members", () => {
  it("open to everyone when nothing is configured", () => {
    expect(isAllowedEmail("anyone@x.com", {})).toBe(true);
  });

  it("only the owner and listed members once configured", () => {
    const env = { IDEAOS_USER_EMAIL: " Me@X.com ", IDEAOS_MEMBERS: "friend@y.com，other@z.com  me@x.com" };
    expect(ownerEmail(env)).toBe("me@x.com");
    expect(memberEmails(env)).toEqual(["friend@y.com", "other@z.com"]);
    expect(isAllowedEmail("ME@x.com", env)).toBe(true);
    expect(isAllowedEmail("friend@y.com", env)).toBe(true);
    expect(isAllowedEmail("stranger@q.com", env)).toBe(false);
    expect(isAllowedEmail(null, env)).toBe(false);
  });
});
