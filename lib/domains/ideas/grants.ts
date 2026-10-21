import { ANY_AREA, mergeGrants, parseGrants, type Grant } from "./grants-shared";

export * from "./grants-shared";

const ENDPOINT = "https://api.jgrants-portal.go.jp/exp/v1/public/subsidies";
const TIMEOUT_MS = 12_000;

async function search(keyword: string, area: string | null): Promise<Grant[] | null> {
  const params = new URLSearchParams({
    keyword,
    sort: "acceptance_end_datetime",
    order: "ASC",
    acceptance: "1",
    ...(area ? { target_area_search: area } : {}),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal, headers: { Accept: "application/json" } });
    return res.ok ? parseGrants(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 现在还在招募的补助金：「不限地区」不按地区筛；选了某个都道府县时，连同标了「全国」的一起查
 * （接口按地区分开存，只查县会漏掉全国都能申请的）。都没取到返回 null。
 */
export async function searchGrants(keyword: string, area: string): Promise<Grant[] | null> {
  const areas: (string | null)[] = area === ANY_AREA ? [null] : ["全国", area];
  const lists = await Promise.all(areas.map((a) => search(keyword, a)));
  if (lists.every((l) => l === null)) return null;
  return mergeGrants(lists.map((l) => l ?? []));
}
