import { countedCases, listTransferCases, type TransferCase } from "./atlas";
import { tokyoToday } from "./brief";
import { gapKanpo, loadGapDeep, type GapKanpo } from "./deep";
import type { GapDeep } from "./deep-shared";
import { loadFakeDoorStats, type FakeDoorStats } from "./fake-door";
import { loadGapTransfers } from "./gap-transfer";
import { listGapBoard, loadGapRechecks, type JapanGapRow } from "./gaps";
import { gapPlaces, transferKey, type ArrivedGap, type GapRecheck, type GapSide, type GapTransfer } from "./gaps-shared";
import { gapDemand, listIssues, type GapDemand } from "./issue";
import { caseNotices } from "./kanpo";
import type { KanpoNotice } from "./kanpo-shared";
import { loadGapVoices, type GapVoices } from "./voices";
import { latestGapImage, type GapImage } from "./images";

export type DeepPage = {
  side: GapSide;
  there: string;
  here: string;
  /** 还开着的（带最近一次重查），或者重查发现这边有了的，二选一。 */
  open: JapanGapRow | null;
  arrived: ArrivedGap | null;
  /** 这一条的每月重查，新的在前。 */
  rechecks: GapRecheck[];
  /** 迁移 083 没跑为 "missing-schema"。 */
  deep: GapDeep | null | "missing-schema";
  transfer: GapTransfer | null;
  voices: GapVoices | null;
  /** 时差图谱里算进统计的先例（图谱没建为 null）。 */
  cases: TransferCase[] | null;
  /** 先例 id → 对上的官报决算。 */
  caseNotices: Record<string, KanpoNotice>;
  kanpo: GapKanpo;
  door: FakeDoorStats | null;
  demand: GapDemand | null;
  /** 最新的一张 AI 示意图（迁移 085 没跑为 "missing-schema"）。 */
  image: GapImage | null | "missing-schema";
};

/** 一条讲透那一页要的全部料；这条在清单里找不到了返回 null。 */
export async function loadDeepPage(userId: string, side: GapSide, signalId: string): Promise<DeepPage | null> {
  const key = transferKey(side, signalId);
  const [board, rechecks, deep, transfers, voices, cases, notices, doors, issues, image] = await Promise.all([
    listGapBoard(userId, tokyoToday()),
    loadGapRechecks(userId),
    loadGapDeep(userId, side, signalId),
    loadGapTransfers(userId),
    loadGapVoices(userId),
    listTransferCases(userId).catch(() => "missing-schema" as const),
    caseNotices(userId).catch(() => new Map<string, KanpoNotice>()),
    loadFakeDoorStats(userId),
    listIssues(userId).catch(() => []),
    latestGapImage(userId, side, signalId).catch(() => null),
  ]);
  const open = board.sides[side].open.find((g) => g.signal_id === signalId) ?? null;
  const arrived = board.sides[side].arrived.find((g) => g.signal_id === signalId) ?? null;
  const gap = open ?? arrived;
  if (!gap) return null;
  return {
    side,
    ...gapPlaces(side),
    open,
    arrived,
    rechecks: (rechecks ?? []).filter((r) => r.side === side && r.signal_id === signalId),
    deep,
    transfer: transfers.get(key) ?? null,
    voices: voices.get(key) ?? null,
    cases: cases === "missing-schema" ? null : countedCases(cases),
    caseNotices: Object.fromEntries(notices),
    kanpo: await gapKanpo(userId, gap, deep === "missing-schema" ? null : deep),
    door: doors.get(key) ?? null,
    demand: gapDemand(issues).get(key) ?? null,
    image,
  };
}
