// 假方案（decoy）的类型、错漏分类学与 AI 输出解析器。
// "use server" 文件不能导出常量，所以分类学和解析器放这里（council 同款分工）。

export const DECOY_FLAW_TYPES = [
  { type: "false_need", label: "伪需求假设", hint: '把"我觉得有用"当"用户有痛"' },
  { type: "survivorship", label: "幸存者偏差", hint: "拿成功案例当可复制路径" },
  { type: "channel_fantasy", label: "渠道幻觉", hint: '"做好了自然有人来"' },
  { type: "armchair_number", label: "拍脑袋数字", hint: "精确但无来源的数据" },
  { type: "causal_inversion", label: "因果倒置", hint: "相关当因果" },
  { type: "hidden_cost", label: "隐藏成本", hint: "时间/合规/维护被略过" },
  { type: "unfalsifiable", label: "不可证伪", hint: "方案怎样都能自圆其说" },
  { type: "solution_first", label: "拿锤找钉", hint: "先有方案再倒推问题存在" },
  { type: "self_as_user", label: "自我代入", hint: '"我会用"当"市场会买"，样本只有自己' },
  { type: "competitor_blind", label: "竞品真空", hint: '假装没人做过，"我们没有竞争对手"' },
  { type: "vanity_metric", label: "虚荣指标", hint: "用下载量/点赞/围观当付费验证" },
  { type: "best_case_only", label: "只算晴天账", hint: "全按最顺利情况排，没有失败分支" },
  { type: "tam_fallacy", label: "大盘算账", hint: '"千亿市场拿下 1% 就是十亿"式自上而下算账' },
  { type: "free_to_paid", label: "免费幻觉", hint: "把免费用户当成未来付费用户，跳过付费验证" },
  { type: "polite_yes", label: "礼貌好评", hint: '把"朋友说不错"的客套当成需求证据' },
  { type: "analogy_leap", label: "类比当论证", hint: '"我们是 X 界的 Uber"，用类比替代验证' },
  { type: "trend_surfing", label: "风口叙事", hint: "用宏观趋势/风口替代自身方案的验证" },
  { type: "single_dependency", label: "单点依赖", hint: "整个方案押在一个不受控的外部条件上" },
] as const;

export type DecoyFlawType = (typeof DECOY_FLAW_TYPES)[number]["type"];

const FLAW_TYPE_SET = new Set<string>(DECOY_FLAW_TYPES.map((t) => t.type));

export function decoyFlawLabel(type: DecoyFlawType): string {
  return DECOY_FLAW_TYPES.find((t) => t.type === type)?.label ?? type;
}

// 画风 = 文风 + 离谱程度一体的难度档位。存进 plan jsonb 的 style 字段（无需迁移）。
export const DECOY_STYLES = [
  {
    style: "consultant",
    label: "一本正经",
    description: "结构化方案体，雷埋得最深——最难找",
  },
  {
    style: "rambling",
    label: "想到哪说到哪",
    description: "碎碎念独白，雷混在跑题和自我说服里",
  },
  {
    style: "unhinged",
    label: "一眼假",
    description: "结构完整但明显不可行——练的是把'为什么死'说清楚",
  },
] as const;

export type DecoyStyle = (typeof DECOY_STYLES)[number]["style"];

export const DEFAULT_DECOY_STYLE: DecoyStyle = "consultant";

export function isDecoyStyle(value: unknown): value is DecoyStyle {
  return typeof value === "string" && DECOY_STYLES.some((s) => s.style === value);
}

export function decoyStyleLabel(style: DecoyStyle): string {
  return DECOY_STYLES.find((s) => s.style === style)?.label ?? style;
}

export type DecoySessionStatus =
  | "drafted"
  | "challenged"
  | "revealed"
  | "drafting_own"
  | "concluded";

export type DecoySection = { heading: string; content: string };

export type DecoyPlantedFlaw = {
  section: string;
  quote: string;
  type: DecoyFlawType;
  why_wrong: string;
};

export type DecoyPlan = {
  sections: DecoySection[];
  planted_flaws: DecoyPlantedFlaw[];
  // 生成时的画风；老数据没有该字段，视为 consultant。解析器不校验它（落库时由 action 附加）。
  style?: DecoyStyle;
};

export type DecoyCaught = {
  quote: string;
  type: DecoyFlawType;
  matched_challenge: string;
};

export type DecoyMissed = {
  quote: string;
  type: DecoyFlawType;
  why_plausible: string;
  why_wrong: string;
};

export type DecoyBonus = { point: string; comment: string };

export type DecoyReveal = {
  caught: DecoyCaught[];
  missed: DecoyMissed[];
  bonus: DecoyBonus[];
};

export type OwnPlanSuspectedFlaw = {
  quote: string;
  type: DecoyFlawType;
  comment: string;
};

export type OwnPlanCritique = {
  suspected_flaws: OwnPlanSuspectedFlaw[];
  open_questions: string[];
};

// drafted/challenged 阶段送往客户端的删减版：绝不带 planted_flaws（答案泄漏）。
export type DecoyPlanPublic = { sections: DecoySection[] };

export type DecoySessionRow = {
  id: string;
  idea_id: string | null;
  problem: string;
  plan: DecoyPlan;
  challenges: string | null;
  reveal: DecoyReveal | null;
  own_plan: string | null;
  own_plan_critique: OwnPlanCritique | null;
  final_plan: string | null;
  learned: string | null;
  status: DecoySessionStatus;
  created_at: string;
  revealed_at: string | null;
  concluded_at: string | null;
};

// ---------------------------------------------------------------------------
// 解析器：校验失败抛错 → gateway 归类为 schema_violation → 触发一次 repair 重试
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

export function parseDecoyPlan(value: unknown): DecoyPlan {
  const root = asRecord(value, "plan");
  const sections = asArrayField(root, "sections", "plan").map((s, i) => {
    const rec = asRecord(s, `sections[${i}]`);
    return {
      heading: asStringField(rec, "heading", `sections[${i}]`),
      content: asStringField(rec, "content", `sections[${i}]`),
    };
  });
  if (sections.length < 3 || sections.length > 5) {
    throw new Error(`sections 必须是 3-5 段，得到 ${sections.length}`);
  }
  const fullText = sections.map((s) => s.content).join("\n");
  const planted_flaws = asArrayField(root, "planted_flaws", "plan").map((f, i) => {
    const rec = asRecord(f, `planted_flaws[${i}]`);
    const flaw: DecoyPlantedFlaw = {
      section: asStringField(rec, "section", `planted_flaws[${i}]`),
      quote: asStringField(rec, "quote", `planted_flaws[${i}]`),
      type: asFlawType(rec.type, `planted_flaws[${i}]`),
      why_wrong: asStringField(rec, "why_wrong", `planted_flaws[${i}]`),
    };
    if (!fullText.includes(flaw.quote)) {
      throw new Error(`planted_flaws[${i}].quote 不是方案正文的逐字子串`);
    }
    return flaw;
  });
  if (planted_flaws.length < 2 || planted_flaws.length > 4) {
    throw new Error(`planted_flaws 必须是 2-4 处，得到 ${planted_flaws.length}`);
  }
  return { sections, planted_flaws };
}

export function parseDecoyReveal(value: unknown): DecoyReveal {
  const root = asRecord(value, "reveal");
  const caught = asArrayField(root, "caught", "reveal").map((c, i) => {
    const rec = asRecord(c, `caught[${i}]`);
    return {
      quote: asStringField(rec, "quote", `caught[${i}]`),
      type: asFlawType(rec.type, `caught[${i}]`),
      matched_challenge: asStringField(rec, "matched_challenge", `caught[${i}]`),
    };
  });
  const missed = asArrayField(root, "missed", "reveal").map((m, i) => {
    const rec = asRecord(m, `missed[${i}]`);
    return {
      quote: asStringField(rec, "quote", `missed[${i}]`),
      type: asFlawType(rec.type, `missed[${i}]`),
      why_plausible: asStringField(rec, "why_plausible", `missed[${i}]`),
      why_wrong: asStringField(rec, "why_wrong", `missed[${i}]`),
    };
  });
  const bonus = asArrayField(root, "bonus", "reveal").map((b, i) => {
    const rec = asRecord(b, `bonus[${i}]`);
    return {
      point: asStringField(rec, "point", `bonus[${i}]`),
      comment: asStringField(rec, "comment", `bonus[${i}]`),
    };
  });
  return { caught, missed, bonus };
}

export function parseOwnPlanCritique(value: unknown): OwnPlanCritique {
  const root = asRecord(value, "critique");
  const suspected_flaws = asArrayField(root, "suspected_flaws", "critique").map((f, i) => {
    const rec = asRecord(f, `suspected_flaws[${i}]`);
    return {
      quote: asStringField(rec, "quote", `suspected_flaws[${i}]`),
      type: asFlawType(rec.type, `suspected_flaws[${i}]`),
      comment: asStringField(rec, "comment", `suspected_flaws[${i}]`),
    };
  });
  const open_questions = asArrayField(root, "open_questions", "critique").map((q, i) => {
    if (typeof q !== "string" || !q.trim()) {
      throw new Error(`open_questions[${i}] 必须是非空字符串`);
    }
    return q.trim();
  });
  return { suspected_flaws, open_questions };
}
