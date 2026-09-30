import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// "use client" 文件只许导出组件，不许导出常量。
//
// 服务端组件从 client 文件 import 进来的东西，不是那个值本身，
// 而是一个客户端引用。拿它当组件渲染没问题；读它的属性就炸 ——
// /self 的 KIND_LABELS[hypothesis.kind] 就是这么让整页 500 的。
// tsc 看不出来（类型是对的），单测也看不出来（不走 RSC 打包）。
//
// 规则：client 文件里 export const 的名字必须是 PascalCase（组件）。
// 标签表、选项数组这类常量放进 lib/，两边都从那里拿。

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

describe("client 文件不导出常量", () => {
  it("\"use client\" 文件里没有非组件的 export const", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      const full = path.join(ROOT, dir);
      if (!fs.existsSync(full)) continue;
      for (const file of walk(full)) {
        const source = fs.readFileSync(file, "utf8");
        if (!/^\s*["']use client["']/.test(source)) continue;
        for (const match of source.matchAll(/^export\s+(?:const|let|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
          const name = match[1];
          if (/^[A-Z][a-z0-9]/.test(name)) continue;
          offenders.push(`${path.relative(ROOT, file)} 导出了 ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
