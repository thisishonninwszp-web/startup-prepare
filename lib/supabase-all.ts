/**
 * Supabase（PostgREST）一次最多回 1000 行，写多大的 limit 都一样 —— 超过的悄悄截掉。
 * 要全部的地方用这个按 range 一页页取完（build 里要带固定的 order，不然翻页会重、会漏）。
 */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}
