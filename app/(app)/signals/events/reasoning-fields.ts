export type QuoteRef = { snapshotId: string; quote: string };
export const dimensions = [["definition", "统计定义"], ["unit", "单位"], ["period", "周期"], ["geography", "地域"], ["priceBasis", "名义 / 实际口径"], ["quantityBasis", "金额 / 数量口径"]] as const;
export const reasoningKinds = [["claim", "保留判断"], ["increment", "信息增量与来源独立性"], ["denominator", "样本与分母"], ["comparability", "数字可比性"], ["disagreement", "双方分歧"], ["mechanism", "传导链"], ["applicability", "类比适用条件"], ["review", "后续核对"], ["correction", "来源更正"]] as const;
export function reasoningPayload(kind: string, data: FormData, refs: QuoteRef[]): Record<string, unknown> {
  const get = (key: string) => String(data.get(key) ?? "").trim();
  const base = { text: get("text"), refs, claimIds: data.getAll("claimIds").map(String) };
  const fields = (names: string[]) => Object.fromEntries(names.map(name => [name, get(name)]));
  if (kind === "increment") return { ...base, baseline: refs[0], addition: refs[1], ...fields(["increment", "independence", "independenceBasis"]) };
  if (kind === "denominator") return { ...base, ...fields(["sample", "population", "denominator", "omittedGroups"]) };
  if (kind === "comparability") return { ...base, ...fields(["verdict", "reason"]), dimensions: Object.fromEntries(dimensions.map(([name]) => [name, { left: get(`${name}.left`), right: get(`${name}.right`) }])) };
  if (kind === "disagreement") return { ...base, left: refs[0], right: refs[1], ...fields(["cause", "checkQuestion"]) };
  if (kind === "mechanism") return { ...base, links: [1, 2, 3, 4, 5].map(i => ({ text: get(`link${i}.text`), refs: get(`link${i}.ref`) === "yes" ? refs : [], counterexample: get(`link${i}.counterexample`), unknown: get(`link${i}.unknown`) })).filter(link => link.text) };
  if (kind === "applicability") return { ...base, ...fields(["conditions", "invalidators", "followUp"]) };
  if (kind === "correction") return { ...base, oldSnapshotId: refs[0]?.snapshotId, newSnapshotId: refs[1]?.snapshotId };
  return base;
}
