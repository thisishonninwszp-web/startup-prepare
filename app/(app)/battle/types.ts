// 心魔（battle）的类型与 AI 输出解析器。
// 谬误分类学复用 decoy 的 DECOY_FLAW_TYPES（宪法：不新建分类学）。

import { DECOY_FLAW_TYPES, type DecoyFlawType } from "../decoy/types";

const FLAW_TYPE_SET = new Set<string>(DECOY_FLAW_TYPES.map((t) => t.type));

export type BattleStatus = "active" | "concluded";

export type BattleFallacy = { type: DecoyFlawType; quote: string };

export type BattleMessage = {
  role: "user" | "demon";
  content: string;
  // demon 专用；active 状态下服务端剥离，绝不下发客户端。
  fallacies?: BattleFallacy[];
  out_of_excuses?: boolean;
};

export type DemonTurn = {
  content: string;
  fallacies: BattleFallacy[];
  out_of_excuses: boolean;
};

export type BattleRecapCaught = {
  quote: string;
  type: DecoyFlawType;
  matched_attack: string;
};

export type BattleRecapMissed = {
  quote: string;
  type: DecoyFlawType;
  how_it_fooled_you: string;
};

export type BattleBonus = { point: string; comment: string };

export type BattleRecap = {
  caught: BattleRecapCaught[];
  missed: BattleRecapMissed[];
  bonus: BattleBonus[];
};

export type BattleSessionRow = {
  id: string;
  idea_id: string | null;
  claim: string;
  messages: BattleMessage[];
  recap: BattleRecap | null;
  final_position: string | null;
  learned: string | null;
  status: BattleStatus;
  created_at: string;
  concluded_at: string | null;
};

// ---------------------------------------------------------------------------
// 解析器：校验失败抛错 → gateway 归类 schema_violation → 触发一次 repair 重试
// （与 decoy/types.ts 的小工具函数同构；刻意不跨模块共享私有工具，保持文件自洽）
// ---------------------------------------------------------------------------

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function asStringField(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`${label}.${key} 必须是非空字符串`);
  }
  return v.trim();
}

function asArrayField(obj: Record<string, unknown>, key: string, label: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) throw new Error(`${label}.${key} 必须是数组`);
  return v;
}

function asFlawType(value: unknown, label: string): DecoyFlawType {
  if (typeof value !== "string" || !FLAW_TYPE_SET.has(value)) {
    throw new Error(`${label} 的 type 不在错漏分类学里：${String(value)}`);
  }
  return value as DecoyFlawType;
}

export function parseDemonTurn(value: unknown): DemonTurn {
  const root = asRecord(value, "turn");
  const content = asStringField(root, "content", "turn");
  const fallacies = asArrayField(root, "fallacies", "turn").map((f, i) => {
    const rec = asRecord(f, `fallacies[${i}]`);
    const fallacy: BattleFallacy = {
      type: asFlawType(rec.type, `fallacies[${i}]`),
      quote: asStringField(rec, "quote", `fallacies[${i}]`),
    };
    if (!content.includes(fallacy.quote)) {
      throw new Error(`fallacies[${i}].quote 不是 content 的逐字子串`);
    }
    return fallacy;
  });
  const out = root.out_of_excuses;
  if (out !== undefined && typeof out !== "boolean") {
    throw new Error("turn.out_of_excuses 必须是布尔值");
  }
  return { content, fallacies, out_of_excuses: out === true };
}

export function parseBattleRecap(value: unknown): BattleRecap {
  const root = asRecord(value, "recap");
  const caught = asArrayField(root, "caught", "recap").map((c, i) => {
    const rec = asRecord(c, `caught[${i}]`);
    return {
      quote: asStringField(rec, "quote", `caught[${i}]`),
      type: asFlawType(rec.type, `caught[${i}]`),
      matched_attack: asStringField(rec, "matched_attack", `caught[${i}]`),
    };
  });
  const missed = asArrayField(root, "missed", "recap").map((m, i) => {
    const rec = asRecord(m, `missed[${i}]`);
    return {
      quote: asStringField(rec, "quote", `missed[${i}]`),
      type: asFlawType(rec.type, `missed[${i}]`),
      how_it_fooled_you: asStringField(rec, "how_it_fooled_you", `missed[${i}]`),
    };
  });
  const bonus = asArrayField(root, "bonus", "recap").map((b, i) => {
    const rec = asRecord(b, `bonus[${i}]`);
    return {
      point: asStringField(rec, "point", `bonus[${i}]`),
      comment: asStringField(rec, "comment", `bonus[${i}]`),
    };
  });
  return { caught, missed, bonus };
}
