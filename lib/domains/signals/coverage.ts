import { PESTLE_DOMAINS, type PestleDomain } from "@/lib/ai/signals";
import type { BriefItem } from "./brief";

/**
 * PESTLE 查漏补缺：这一周的报告里，政治、经济、社会、技术、法律、环境各出现了几条。
 * 一直是零的那个领域，就是报告（和你）长期没在看的地方 —— 只当检查表，不当主干。
 */

export const DOMAIN_LABELS: Record<PestleDomain, string> = {
  political: "政治、外交",
  economic: "经济、产业",
  social: "社会、人口、生活",
  technological: "技术",
  legal: "法律、规制",
  environmental: "环境、能源、灾害",
};

export type DomainCount = { domain: PestleDomain; label: string; count: number };

/** 精选里每个领域出现了几条（"也值得一看"那几条不算）。按 PESTLE 的顺序排。 */
export function pestleCoverage(items: Pick<BriefItem, "domain" | "extra">[]): DomainCount[] {
  return PESTLE_DOMAINS.map((domain) => ({
    domain,
    label: DOMAIN_LABELS[domain],
    count: items.filter((i) => !i.extra && i.domain === domain).length,
  }));
}
