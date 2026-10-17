import { join } from "node:path";

/**
 * 官报 PDF 抽文字（只在本机脚本里用，页面不 import）。
 * pdfjs 的 legacy 构建能在 Node 里跑；日文要给 cMap 的文件系统路径（不是 file:// 地址，Windows 上 file:// 读不到）。
 * 按 hasEOL 拼成行：标签的字和字之间会有空格，切条前用 kanpo-shared 的 squashCjk 去掉。
 */
export async function pdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base = join(process.cwd(), "node_modules", "pdfjs-dist");
  // pdfjs 6 的 destroy 在 loadingTask 上，不在 doc 上
  const task = pdfjs.getDocument({
    data,
    cMapUrl: join(base, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(base, "standard_fonts") + "/",
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join(""));
    }
    return pages.join("\n");
  } finally {
    await task.destroy();
  }
}
