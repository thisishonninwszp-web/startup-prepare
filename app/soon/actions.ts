"use server";

import { cancelSignup, recordDoorView, signupToDoor, type SignupResult } from "@/lib/domains/signals/fake-door";

/**
 * 假门公开页的动作：不用登录，按地址里的口令认。陌生人能调到的只有这三个，
 * 每个都只碰口令对得上的那一页 / 那一条登记。
 */

export async function recordDoorViewAction(token: string): Promise<void> {
  await recordDoorView(token);
}

export async function signupDoorAction(token: string, email: string, note: string, trap: string): Promise<SignupResult> {
  try {
    return await signupToDoor(token, String(email ?? ""), String(note ?? ""), String(trap ?? ""));
  } catch (error) {
    console.error("door signup failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function cancelSignupAction(cancelToken: string): Promise<boolean> {
  try {
    return await cancelSignup(cancelToken);
  } catch (error) {
    console.error("door cancel failed", error);
    return false;
  }
}
