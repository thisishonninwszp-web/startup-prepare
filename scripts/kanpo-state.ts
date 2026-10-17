import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** 今天抓过官报没有，记在这台电脑上：填表助手自动跑的、npm run kanpo:fetch 手动跑的，算同一件事。 */
const STATE = join(tmpdir(), "ideaos-jobs", "last-kanpo-fetch.txt");

export function kanpoFetchedOn(): string {
  try {
    return readFileSync(STATE, "utf8").trim();
  } catch {
    return "";
  }
}

export function markKanpoFetched(day: string): void {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, day, "utf8");
}
