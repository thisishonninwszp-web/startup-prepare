import { mkdir, writeFile } from "node:fs/promises";
import { inspectRakutenItem, searchBusinessCandidates } from "../lib/domains/business-teardowns/providers/rakuten";

// Read-only verification: at most one ranking request and one selected item request.
// No raw exceptions, response bodies, credential values, AI calls, or database writes.
async function main() {
  const checkedAt = new Date().toISOString();
  let authorizedRequests = 0;
  const beforeRequest = async () => { authorizedRequests += 1; if (authorizedRequests > 2) throw new Error("Verification request budget exceeded"); };
  const result: Record<string, unknown> = { checkedAt, source: "official_api", databaseWrites: false, aiCalls: false };
  try {
    const ranking = await searchBusinessCandidates({ mode: "ranking", beforeRequest });
    result.ranking = { status: "available", count: ranking.items.length, coverage: ranking.coverage };
    const selected = ranking.items[0];
    if (!selected) result.item = { status: "unavailable", reason: "Ranking returned no candidate" };
    else {
      const verified = await inspectRakutenItem(selected.itemCode, { shopCode: selected.merchant.platformShopId, beforeRequest });
      // Save only allowlisted non-personal public fields, never API raw output.
      result.item = { status: "available", merchant: verified.merchant, itemId: verified.snapshot.itemId, sourceUrl: verified.snapshot.sourceUrl, price: selected.price, quantities: verified.snapshot.quantities, coverage: verified.snapshot.coverage, missingFields: ["displayed_sales", "units_per_order", "buyer_demographics", "review_text", "precise_sales_period"] };
    }
  } catch (error) {
    result.status = "unavailable";
    // Provider errors are intentionally bounded generic messages; do not serialize errors.
    result.reason = error instanceof Error && /^(楽天|官方|查询|商品|所选)/.test(error.message) ? error.message : "Official source request unavailable";
  }
  result.authorizedRequests = authorizedRequests;
  const directory = "lib/domains/business-teardowns/providers/fixtures";
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/live-availability.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: result.status ?? "available", authorizedRequests, output: `${directory}/live-availability.json` }));
}
void main();
