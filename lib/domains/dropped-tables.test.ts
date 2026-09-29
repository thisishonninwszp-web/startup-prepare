import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 迁移里 drop 掉的表，代码里不许再有人查。
//
// 这条守卫是 048 那次教训写的：专长树连同 self_skill_ticks 一起删了，
// 但 getWeeklyReport 还在查它。本地测试全绿、tsc 全绿 —— 因为表名是字符串，
// 谁都拦不住。直到迁移真跑到线上，/self 整页才白。
//
// 表名是字符串，类型系统看不见，所以只能靠扫。

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function droppedTables(): string[] {
  const dir = path.join(ROOT, "supabase", "migrations");
  const names = new Set<string>();
  for (const file of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    for (const match of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      names.add(match[1].toLowerCase());
    }
    // 后来又建回来的不算（幂等迁移里 drop 再 create 的情况）。
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      names.delete(match[1].toLowerCase());
    }
  }
  return [...names];
}

describe("被迁移删掉的表，代码里不许再查", () => {
  it("没有一处 from(\"<已删的表>\")", () => {
    const dropped = droppedTables();
    expect(dropped.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const dir of ["app", "lib", "components"]) {
      const full = path.join(ROOT, dir);
      if (!fs.existsSync(full)) continue;
      for (const file of walk(full)) {
        const source = fs.readFileSync(file, "utf8");
        for (const table of dropped) {
          if (source.includes(`from("${table}")`) || source.includes(`from('${table}')`)) {
            offenders.push(`${path.relative(ROOT, file)} 还在查已删的 ${table}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
