/**
 * 招聘页的正文。读文章用的 extractSearchText 只留 20 字以上的段落，
 * 招聘页的关键信息偏偏在短格子里（「勤務地」「大阪府大阪市」「年収」「450万円〜」），所以单独写一个：
 * 先取页面里的 JobPosting 结构化数据（很多招聘页为了上 Google 求人检索都会放），
 * 再按顺序取标题、段落、列表、表格和定义列表，表头 / 定义词和后面的值并成一行。
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function isJobPosting(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

/** 页面里 @type 是 JobPosting 的 JSON-LD，整理成几行字。没有就返回空数组。 */
export function jobPostingJsonLd(html: string): string[] {
  const lines: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const roots = Array.isArray(data) ? data : [data];
    const nodes = roots.flatMap((d) => {
      const graph = (d as { "@graph"?: unknown } | null)?.["@graph"];
      return Array.isArray(graph) ? graph : [d];
    });
    for (const raw of nodes) {
      if (!raw || typeof raw !== "object" || !isJobPosting(raw as Record<string, unknown>)) continue;
      const n = raw as Record<string, unknown>;
      const push = (label: string, value: unknown) => {
        if (typeof value !== "string" && typeof value !== "number") return;
        const text = textOf(String(value));
        if (text) lines.push(`${label}：${text}`);
      };
      const org = n.hiringOrganization as Record<string, unknown> | undefined;
      const place = (Array.isArray(n.jobLocation) ? n.jobLocation[0] : n.jobLocation) as Record<string, unknown> | undefined;
      const addr = place?.address as Record<string, unknown> | undefined;
      push("職種", n.title);
      push("会社", org?.name);
      push(
        "勤務地",
        [addr?.addressRegion, addr?.addressLocality, addr?.streetAddress].filter((x): x is string => typeof x === "string").join("")
      );
      push("勤務形態", n.jobLocationType);
      push("雇用形態", Array.isArray(n.employmentType) ? n.employmentType.join("、") : n.employmentType);
      const salary = n.baseSalary as { currency?: unknown; value?: Record<string, unknown> } | undefined;
      if (salary?.value) {
        const v = salary.value;
        const range = [v.minValue, v.maxValue, v.value].filter((x): x is number => typeof x === "number").join("〜");
        if (range) {
          const unit = typeof v.unitText === "string" ? v.unitText : "";
          push("給与", [range, typeof salary.currency === "string" ? salary.currency : "", unit].filter(Boolean).join(" "));
        }
      }
      push("仕事内容", n.description);
    }
  }
  return lines;
}

const LABEL_TAGS = new Set(["th", "dt"]);
const VALUE_TAGS = new Set(["td", "dd"]);

/** 招聘页的正文（结构化数据在前，页面上的字在后），最多 maxLength 字。 */
export function extractJobText(html: string, maxLength = 15_000): string {
  const lines = jobPostingJsonLd(html);
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|aside)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, " ");
  const seen = new Set(lines);
  let total = lines.join("\n").length;
  let pendingLabel: string | null = null;
  for (const m of cleaned.matchAll(/<(h1|h2|h3|h4|p|li|dt|dd|th|td)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase();
    const text = textOf(m[2]);
    if (!text) continue;
    if (LABEL_TAGS.has(tag)) {
      pendingLabel = text;
      continue;
    }
    const line = VALUE_TAGS.has(tag) && pendingLabel ? `${pendingLabel}：${text}` : text;
    pendingLabel = null;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    total += line.length + 1;
    if (total >= maxLength) break;
  }
  return lines.join("\n").slice(0, maxLength);
}
