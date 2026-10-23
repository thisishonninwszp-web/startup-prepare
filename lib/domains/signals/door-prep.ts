import { loadActState } from "./act";
import { draftFakeDoorContent } from "./fake-door";
import { doorLang } from "./fake-door-shared";
import { transferKey } from "./gaps-shared";
import { analyzeGapVoices, loadGapVoices, saveDoorDraft } from "./voices";
import { LISTEN_EVERY_HOURS, pickDoorGap, pickListenGap, suggestedPrice } from "./door-prep-shared";

export * from "./door-prep-shared";

/**
 * 假门 AI 先做好（经用户同意，2026-10-23）—— 后台 jobs 的 prep 一步，一天两轮、每轮最多做一步：
 * ① 离上一次自动「听一听」超过 20 小时，就给差距清单里最新一条没听过的「听一听」（找这边的人的原话，规则照旧）；
 * ② 有原话够了（3 句以上）、还没开假门、还没做过的，就让 AI 把假门那一页写好（规矩照旧：不许编人数、评价、价格），
 *    价格由代码按楽天同类商品的中位数先填一个、写明出处（没有数据就空着，要他自己填），存进那一条的 analysis.door_draft。
 * 做好的出现在一分钟清单里，他看过点「发布」才有公开页；点「不要」就不再为这一条做。
 */
export async function prepStep(userId: string): Promise<{ did: number; note: string }> {
  const [state, voices] = await Promise.all([loadActState(userId), loadGapVoices(userId)]);
  const notes: string[] = [];
  let did = 0;

  // ② 先看有没有能做的假门（原话够了的，做出来马上能用）
  const door = pickDoorGap(state.gaps, (g) => !!voices.get(transferKey(g.side, g.signal_id))?.door_draft);
  if (door) {
    const target = { kind: "gap" as const, signalId: door.signal_id, side: door.side };
    const draft = await draftFakeDoorContent(userId, target);
    const price = suggestedPrice(voices.get(transferKey(door.side, door.signal_id))?.attention, doorLang(door.side));
    await saveDoorDraft(userId, door.signal_id, door.side, {
      draft,
      price: price?.price ?? null,
      price_basis: price?.basis ?? null,
      made_at: new Date().toISOString(),
    });
    notes.push(`做好了假门「${draft.title}」`);
    did += 1;
    return { did, note: notes.join("；") };
  }

  // ① 自动听一听：一天一条
  const last = Array.from(voices.values())
    .map((v) => Date.parse(v.created_at))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (last && Date.now() - last < LISTEN_EVERY_HOURS * 3_600_000) return { did, note: "今天已经听过一条" };
  const listen = pickListenGap(state.gaps);
  if (!listen) return { did, note: "差距清单里的都听过了" };
  const result = await analyzeGapVoices(userId, listen.signal_id, listen.side);
  notes.push(`听了「${listen.headline.slice(0, 20)}」：${result.quotes.length} 句原话`);
  did += 1;
  return { did, note: notes.join("；") };
}
