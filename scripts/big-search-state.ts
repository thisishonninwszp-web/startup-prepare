import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** 今天大搜过没有，记在这台电脑上：填表助手每天自动跑的、npm run jobs:search 手动跑的，算同一件事。 */
const STATE = join(tmpdir(), "ideaos-jobs", "last-big-search.txt");

export function bigSearchedOn(): string {
  try {
    return readFileSync(STATE, "utf8").trim();
  } catch {
    return "";
  }
}

export function markBigSearched(day: string): void {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, day, "utf8");
}
