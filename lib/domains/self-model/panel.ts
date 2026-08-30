// 角色面板：九主属性 / 二十六子属性 / 四个生活域。
//
// 三层的分工：
//   子属性  扛真实数值和它的分母，并且标注这条证据来自哪个生活域
//   特性    挂在具体子属性上做带符号的修正（见 traits 层）
//   主属性  只做同量纲合成（自己的子属性平均），跨主属性永不求和
//
// 规矩和 tiers.ts 一致：没有分母就不给数字。样本不足时 value=null，
// 界面只显示样本数和"还差什么"，绝不显示一个凑出来的分。
//
// 域覆盖是这一层最重要的产物。一条假设要升成 trait 需要跨 3 类情境，
// 而绝大多数人的证据只长在"工作"一个域里 —— 暗着的域才是要去点的地方。

export const DOMAINS = ["work", "body", "people", "self"] as const;
export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_NAMES: Record<Domain, string> = {
  work: "工作",
  body: "身体",
  people: "人际",
  self: "自己",
};

export const MAIN_KEYS = [
  "STR",
  "CON",
  "DEX",
  "INT",
  "WIS",
  "CHA",
  "WIL",
  "LCK",
  "RES",
] as const;
export type MainKey = (typeof MAIN_KEYS)[number];

/**
 * 名字刻意用现实里说得出口的词，不用 D&D 的抽象译名：
 * 「判断」比「智力」准确，因为量的是你押注准不准，不是你聪不聪明；
 * 「底牌」比「资源」诚实，因为它指的是真能打出去的那几张。
 */
export const MAIN_NAMES: Record<MainKey, string> = {
  STR: "力量",
  CON: "续航",
  DEX: "手速",
  INT: "判断",
  WIS: "洞察",
  CHA: "人望",
  WIL: "定力",
  LCK: "机缘",
  RES: "底牌",
};

export type SubAttribute = {
  key: string;
  main: MainKey;
  domain: Domain;
  name: string;
  /** 0–20，样本不足时为 null。 */
  value: number | null;
  sample: number;
  /** 数字怎么来的，带真实的分子分母。 */
  basis: string;
  /** 算不出来时，还差什么。 */
  need: string;
};

export type MainAttribute = {
  key: MainKey;
  name: string;
  /** 已点亮子属性的平均，全暗时为 null。 */
  level: number | null;
  subs: SubAttribute[];
};

export type DomainCoverage = {
  domain: Domain;
  name: string;
  lit: number;
  total: number;
};

export type Panel = {
  mains: MainAttribute[];
  domains: DomainCoverage[];
  lit: number;
  total: number;
};

export type PanelInput = {
  // --- 工作：想法 / 验证 / 决策 / 预测 ---
  predictionsSettled: number;
  predictionsHit: number;
  ideaLifespans: number[];
  longestSpanDays: number;
  activeIdeas: number;
  ideasTotal: number;
  ideasPerMonth: number;
  decisionsTotal: number;
  validationsPerIdea: number[];
  validationsPerMonth: number;
  painNo: number;
  painTotal: number;
  firstContactDelays: number[];
  learnedTexts: string[];
  // --- 关系 ---
  battlesConcluded: number;
  battlesWithNewPosition: number;
  commitmentsTotal: number;
  commitmentsDone: number;
  // --- 身体 ---
  liftSessions: number;
  strengthStart: number;
  strengthNow: number;
  weeklyTonnage: number;
  trainingDays: number;
  trainingLogs: number;
  cardioSessions: number;
  cardioMinutes: number;
  // --- 自己 / 人际：035 补上的采集口 ---
  distinctContexts: number;
  /** 记过睡眠的天数，以及其中睡够 7 小时的天数。 */
  sleepDays: number;
  sleepEnoughDays: number;
  /** 近 90 天把没做完的东西给人看的次数。 */
  exposures: number;
  /** 提议的总数与被采纳数。 */
  proposalsTotal: number;
  proposalsAccepted: number;
  /** 近 90 天第一次接触的人。 */
  newFaces: number;
  /** 标为「捡到的意外」的触发窗口数。 */
  serendipities: number;
  /** 最近一次底牌快照。没填过时为 null。 */
  runwayMonths: number | null;
  allies: number | null;
  weeklyFreeHours: number | null;
};

/** 全空的输入。用来取子属性清单，或者给测试当底座。 */
export const EMPTY_PANEL_INPUT: PanelInput = {
  predictionsSettled: 0,
  predictionsHit: 0,
  ideaLifespans: [],
  longestSpanDays: 0,
  activeIdeas: 0,
  ideasTotal: 0,
  ideasPerMonth: 0,
  decisionsTotal: 0,
  validationsPerIdea: [],
  validationsPerMonth: 0,
  painNo: 0,
  painTotal: 0,
  firstContactDelays: [],
  learnedTexts: [],
  battlesConcluded: 0,
  battlesWithNewPosition: 0,
  commitmentsTotal: 0,
  commitmentsDone: 0,
  liftSessions: 0,
  strengthStart: 0,
  strengthNow: 0,
  weeklyTonnage: 0,
  trainingDays: 0,
  trainingLogs: 0,
  cardioSessions: 0,
  cardioMinutes: 0,
  distinctContexts: 0,
  sleepDays: 0,
  sleepEnoughDays: 0,
  exposures: 0,
  proposalsTotal: 0,
  proposalsAccepted: 0,
  newFaces: 0,
  serendipities: 0,
  runwayMonths: null,
  allies: null,
  weeklyFreeHours: null,
};

const MIN_SAMPLE = 5;
const MIN_SAMPLE_SMALL = 3;
const MIN_SAMPLE_BODY = 4;
const CONSISTENCY_WINDOW_DAYS = 56;
/** 每周 4 练封顶。再高不额外加分，那是恢复问题不是意志问题。 */
const CONSISTENCY_TARGET = 4 / 7;

function band(
  value: number,
  table: [limit: number, score: number][],
  fallback: number
): number {
  for (const [limit, score] of table) {
    if (value <= limit) return score;
  }
  return fallback;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratioToScore(ratio: number, best: number): number {
  return Math.max(0, Math.min(20, Math.round((ratio / best) * 20)));
}

/** 估算 1RM（Epley）。>12 次的组推算已经不准，不当力量数据用。 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  return weightKg * (1 + reps / 30);
}

/** 中日文没有词边界，用字符二元组的 Jaccard 近似"这两句在说同一件事"。 */
function bigrams(text: string): Set<string> {
  const clean = text.replace(/[\s\p{P}]/gu, "");
  const grams = new Set<string>();
  for (let i = 0; i + 1 < clean.length; i += 1) {
    grams.add(clean.slice(i, i + 2));
  }
  return grams;
}

/**
 * 重复犯错率：新写下的「学到了」和旧的有多像。
 * 三年 40 条学到了，如果一直在说同一件事，那不是四十次成长。
 */
export function repeatRate(texts: string[], threshold = 0.4): number {
  if (texts.length < 2) return 0;
  const grams = texts.map(bigrams);
  let repeats = 0;
  for (let i = 1; i < grams.length; i += 1) {
    const current = grams[i];
    if (current.size === 0) continue;
    for (let j = 0; j < i; j += 1) {
      const earlier = grams[j];
      if (earlier.size === 0) continue;
      let shared = 0;
      current.forEach((gram) => {
        if (earlier.has(gram)) shared += 1;
      });
      const union = current.size + earlier.size - shared;
      if (union > 0 && shared / union >= threshold) {
        repeats += 1;
        break;
      }
    }
  }
  return repeats / (texts.length - 1);
}

type SubSpec = {
  key: string;
  main: MainKey;
  domain: Domain;
  name: string;
  build: (input: PanelInput) => {
    value: number | null;
    sample: number;
    basis: string;
    need: string;
  };
};

/** 还没有采集口的子属性：诚实地空着，并说清楚缺什么。 */
function notCollected(need: string) {
  return { value: null, sample: 0, basis: "尚未采集", need };
}

const SUB_SPECS: SubSpec[] = [
  // ---------------- STR ----------------
  {
    key: "str.absolute",
    main: "STR",
    domain: "body",
    name: "极限重量",
    build: (input) => {
      const gain =
        input.strengthStart > 0 ? input.strengthNow / input.strengthStart - 1 : 0;
      const ready = input.liftSessions >= MIN_SAMPLE_BODY && input.strengthStart > 0;
      return {
        value: ready ? ratioToScore(gain, 0.5) : null,
        sample: input.liftSessions,
        basis: `1RM 合计 ${Math.round(input.strengthStart)} → ${Math.round(
          input.strengthNow
        )} kg（${gain >= 0 ? "+" : ""}${Math.round(gain * 100)}%）`,
        need:
          input.liftSessions < MIN_SAMPLE_BODY
            ? `还需 ${MIN_SAMPLE_BODY - input.liftSessions} 次带重量的训练`
            : "同一个动作至少记两次才比得出进步",
      };
    },
  },
  {
    key: "str.volume",
    main: "STR",
    domain: "body",
    name: "训练总量",
    build: (input) => ({
      value:
        input.liftSessions >= MIN_SAMPLE_BODY
          ? band(
              input.weeklyTonnage,
              [
                [2000, 4],
                [6000, 9],
                [12000, 14],
                [20000, 18],
              ],
              20
            )
          : null,
      sample: input.liftSessions,
      basis: `近 4 周平均 ${Math.round(input.weeklyTonnage)} kg/周`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_BODY - input.liftSessions)} 次训练记录`,
    }),
  },

  // ---------------- CON ----------------
  {
    key: "con.aerobic",
    main: "CON",
    domain: "body",
    name: "有氧底子",
    build: (input) => ({
      value:
        input.cardioSessions >= MIN_SAMPLE_BODY
          ? band(
              input.cardioMinutes,
              [
                [30, 2],
                [90, 6],
                [200, 11],
                [400, 16],
              ],
              20
            )
          : null,
      sample: input.cardioSessions,
      basis: `近 28 天 ${Math.round(input.cardioMinutes)} 分钟`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_BODY - input.cardioSessions)} 条有氧记录`,
    }),
  },
  {
    key: "con.regular",
    main: "CON",
    domain: "body",
    name: "出勤率",
    build: (input) => ({
      value:
        input.trainingLogs >= MIN_SAMPLE_BODY
          ? ratioToScore(
              input.trainingDays / CONSISTENCY_WINDOW_DAYS,
              CONSISTENCY_TARGET
            )
          : null,
      sample: input.trainingLogs,
      basis: `${input.trainingDays}/${CONSISTENCY_WINDOW_DAYS} 天（约每周 ${(
        (input.trainingDays / CONSISTENCY_WINDOW_DAYS) *
        7
      ).toFixed(1)} 次）`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_BODY - input.trainingLogs)} 条训练记录`,
    }),
  },
  {
    key: "con.sleep",
    main: "CON",
    domain: "self",
    name: "睡眠债",
    build: (input) => ({
      value:
        input.sleepDays >= MIN_SAMPLE
          ? ratioToScore(input.sleepEnoughDays / input.sleepDays, 1)
          : null,
      sample: input.sleepDays,
      // 用"睡够 7 小时的天数占比"而不是平均时长：
      // 平均值会把"五天四小时 + 两天十二小时"洗成健康。
      basis: `睡够 7 小时 ${input.sleepEnoughDays}/${input.sleepDays} 天`,
      need: `还需 ${Math.max(0, MIN_SAMPLE - input.sleepDays)} 天睡眠记录`,
    }),
  },

  // ---------------- DEX ----------------
  {
    key: "dex.ignition",
    main: "DEX",
    domain: "work",
    name: "开工速度",
    build: (input) => {
      const days = median(input.firstContactDelays);
      return {
        value:
          input.firstContactDelays.length >= MIN_SAMPLE_SMALL
            ? band(
                days,
                [
                  [1, 20],
                  [3, 17],
                  [7, 13],
                  [14, 9],
                  [30, 5],
                ],
                2
              )
            : null,
        sample: input.firstContactDelays.length,
        basis: `中位 ${Math.round(days)} 天`,
        need: `还需 ${Math.max(
          0,
          MIN_SAMPLE_SMALL - input.firstContactDelays.length
        )} 个已接触过的想法`,
      };
    },
  },
  {
    key: "dex.iteration",
    main: "DEX",
    domain: "work",
    name: "迭代节奏",
    build: (input) => ({
      value:
        input.validationsPerMonth > 0
          ? band(
              input.validationsPerMonth,
              [
                [1, 4],
                [3, 9],
                [6, 14],
                [12, 18],
              ],
              20
            )
          : null,
      sample: Math.round(input.validationsPerMonth * 10) / 10,
      basis: `每月 ${input.validationsPerMonth.toFixed(1)} 次`,
      need: "还没有任何验证记录",
    }),
  },
  {
    key: "dex.parallel",
    main: "DEX",
    domain: "work",
    name: "同时开的坑",
    build: (input) => ({
      value:
        input.ideasTotal >= MIN_SAMPLE_SMALL
          ? band(
              input.activeIdeas,
              [
                [1, 5],
                [2, 10],
                [4, 15],
              ],
              20
            )
          : null,
      sample: input.ideasTotal,
      basis: `当前活跃 ${input.activeIdeas} 个`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_SMALL - input.ideasTotal)} 个想法`,
    }),
  },

  // ---------------- INT ----------------
  {
    key: "int.calibration",
    main: "INT",
    domain: "work",
    name: "押注准头",
    build: (input) => ({
      value:
        input.predictionsSettled >= MIN_SAMPLE
          ? ratioToScore(input.predictionsHit / input.predictionsSettled, 1)
          : null,
      sample: input.predictionsSettled,
      basis: `命中 ${input.predictionsHit}/${input.predictionsSettled}`,
      need: `还需 ${Math.max(
        0,
        MIN_SAMPLE - input.predictionsSettled
      )} 条已对账的预测`,
    }),
  },
  {
    key: "int.transfer",
    main: "INT",
    domain: "work",
    name: "学以致用",
    build: () => notCollected("需要在用到某条知识时回标一次"),
  },
  {
    key: "int.repeat",
    main: "INT",
    domain: "work",
    name: "同一个坑摔几次",
    build: (input) => {
      const rate = repeatRate(input.learnedTexts);
      return {
        value:
          input.learnedTexts.length >= MIN_SAMPLE
            ? Math.max(0, Math.min(20, Math.round((1 - rate) * 20)))
            : null,
        sample: input.learnedTexts.length,
        basis: `${input.learnedTexts.length} 条「学到了」中 ${Math.round(
          rate * 100
        )}% 在重复更早的一条`,
        need: `还需 ${Math.max(
          0,
          MIN_SAMPLE - input.learnedTexts.length
        )} 条「学到了」`,
      };
    },
  },

  // ---------------- WIS ----------------
  {
    key: "wis.contact",
    main: "WIS",
    domain: "work",
    name: "见真人",
    build: (input) => ({
      value:
        input.validationsPerIdea.length >= MIN_SAMPLE_SMALL
          ? band(
              mean(input.validationsPerIdea),
              [
                [0.5, 2],
                [1.5, 6],
                [3, 11],
                [6, 16],
              ],
              20
            )
          : null,
      sample: input.validationsPerIdea.length,
      basis: `平均 ${mean(input.validationsPerIdea).toFixed(1)} 次/想法`,
      need: `还需 ${Math.max(
        0,
        MIN_SAMPLE_SMALL - input.validationsPerIdea.length
      )} 个有验证记录的想法`,
    }),
  },
  {
    key: "wis.candor",
    main: "WIS",
    domain: "self",
    name: "敢记坏消息",
    build: (input) => ({
      value:
        input.painTotal >= MIN_SAMPLE
          ? ratioToScore(input.painNo / input.painTotal, 0.5)
          : null,
      sample: input.painTotal,
      basis: `不利证据 ${input.painNo}/${input.painTotal}`,
      need: `还需 ${Math.max(0, MIN_SAMPLE - input.painTotal)} 条验证记录`,
    }),
  },
  {
    key: "wis.persuadable",
    main: "WIS",
    domain: "people",
    name: "听得进反话",
    build: (input) => ({
      value:
        input.battlesConcluded >= MIN_SAMPLE_SMALL
          ? ratioToScore(
              input.battlesWithNewPosition / input.battlesConcluded,
              1
            )
          : null,
      sample: input.battlesConcluded,
      basis: `${input.battlesWithNewPosition}/${input.battlesConcluded} 场对战后改写了立场`,
      need: `还需 ${Math.max(
        0,
        MIN_SAMPLE_SMALL - input.battlesConcluded
      )} 场已结束的对战`,
    }),
  },

  // ---------------- CHA ----------------
  {
    key: "cha.exposure",
    main: "CHA",
    domain: "people",
    name: "敢给人看",
    build: (input) => ({
      value:
        input.exposures > 0
          ? band(
              input.exposures,
              [
                [1, 5],
                [3, 10],
                [6, 15],
              ],
              20
            )
          : null,
      sample: input.exposures,
      basis: `近 90 天 ${input.exposures} 次`,
      need: "记一次「给谁看了什么」就会点亮",
    }),
  },
  {
    key: "cha.adoption",
    main: "CHA",
    domain: "work",
    name: "说话有人听",
    build: (input) => ({
      value:
        input.proposalsTotal >= MIN_SAMPLE_SMALL
          ? ratioToScore(input.proposalsAccepted / input.proposalsTotal, 1)
          : null,
      sample: input.proposalsTotal,
      basis: `采纳 ${input.proposalsAccepted}/${input.proposalsTotal}`,
      need: `还需 ${Math.max(
        0,
        MIN_SAMPLE_SMALL - input.proposalsTotal
      )} 条已有结果的提议`,
    }),
  },
  {
    key: "cha.commitment",
    main: "CHA",
    domain: "people",
    name: "说到做到",
    build: (input) => ({
      value:
        input.commitmentsTotal >= MIN_SAMPLE_SMALL
          ? ratioToScore(input.commitmentsDone / input.commitmentsTotal, 1)
          : null,
      sample: input.commitmentsTotal,
      basis: `兑现 ${input.commitmentsDone}/${input.commitmentsTotal}`,
      need: `还需 ${Math.max(
        0,
        MIN_SAMPLE_SMALL - input.commitmentsTotal
      )} 条周复盘承诺`,
    }),
  },

  // ---------------- WIL ----------------
  {
    key: "wil.closure",
    main: "WIL",
    domain: "work",
    name: "收得了尾",
    build: (input) => ({
      value:
        input.ideasTotal >= MIN_SAMPLE_SMALL
          ? ratioToScore(input.decisionsTotal / input.ideasTotal, 1)
          : null,
      sample: input.ideasTotal,
      basis: `${input.decisionsTotal}/${input.ideasTotal} 走到 Go/Kill`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_SMALL - input.ideasTotal)} 个想法`,
    }),
  },
  {
    key: "wil.span",
    main: "WIL",
    domain: "work",
    name: "最长熬多久",
    build: (input) => ({
      value:
        input.ideasTotal >= MIN_SAMPLE_SMALL
          ? band(
              input.longestSpanDays,
              [
                [14, 4],
                [45, 9],
                [120, 14],
                [240, 18],
              ],
              20
            )
          : null,
      sample: input.ideasTotal,
      basis: `最长 ${Math.round(input.longestSpanDays)} 天`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_SMALL - input.ideasTotal)} 个想法`,
    }),
  },
  {
    key: "wil.restraint",
    main: "WIL",
    domain: "self",
    name: "忍住不开新坑",
    build: (input) => ({
      value:
        input.ideasTotal >= MIN_SAMPLE_SMALL
          ? band(
              input.ideasPerMonth,
              [
                [1, 20],
                [2, 15],
                [4, 10],
                [8, 5],
              ],
              2
            )
          : null,
      sample: input.ideasTotal,
      basis: `每月新开 ${input.ideasPerMonth.toFixed(1)} 个`,
      need: `还需 ${Math.max(0, MIN_SAMPLE_SMALL - input.ideasTotal)} 个想法`,
    }),
  },

  // ---------------- LCK ----------------
  {
    key: "lck.newfaces",
    main: "LCK",
    domain: "people",
    name: "认识新人",
    build: (input) => ({
      value:
        input.newFaces > 0
          ? band(
              input.newFaces,
              [
                [1, 4],
                [3, 9],
                [6, 14],
                [12, 18],
              ],
              20
            )
          : null,
      sample: input.newFaces,
      basis: `近 90 天 ${input.newFaces} 个新面孔`,
      need: "记一个新认识的人就会点亮",
    }),
  },
  {
    key: "lck.newcontext",
    main: "LCK",
    domain: "self",
    name: "进新场子",
    build: (input) => ({
      value:
        input.distinctContexts > 0
          ? band(
              input.distinctContexts,
              [
                [1, 3],
                [2, 7],
                [3, 12],
                [5, 17],
              ],
              20
            )
          : null,
      sample: input.distinctContexts,
      basis: `${input.distinctContexts} 类情境`,
      need: "记一条触发窗口就会点亮",
    }),
  },
  {
    key: "lck.serendipity",
    main: "LCK",
    domain: "self",
    name: "捡到的意外",
    build: (input) => ({
      value:
        input.serendipities > 0
          ? band(
              input.serendipities,
              [
                [1, 6],
                [3, 12],
                [6, 17],
              ],
              20
            )
          : null,
      sample: input.serendipities,
      basis: `${input.serendipities} 次意料之外的收获`,
      need: "在触发窗口上勾一次「捡到的意外」",
    }),
  },

  // ---------------- RES ----------------
  {
    key: "res.runway",
    main: "RES",
    domain: "self",
    name: "跑道",
    build: (input) => ({
      value:
        input.runwayMonths === null
          ? null
          : band(
              input.runwayMonths,
              [
                [3, 4],
                [6, 9],
                [12, 14],
                [24, 18],
              ],
              20
            ),
      sample: input.runwayMonths === null ? 0 : 1,
      basis: `还能撑 ${input.runwayMonths ?? 0} 个月`,
      need: "填一次底牌快照",
    }),
  },
  {
    key: "res.allies",
    main: "RES",
    domain: "people",
    name: "能叫来的人",
    build: (input) => ({
      value:
        input.allies === null
          ? null
          : band(
              input.allies,
              [
                [0, 0],
                [1, 5],
                [3, 10],
                [6, 15],
              ],
              20
            ),
      sample: input.allies === null ? 0 : 1,
      basis: `${input.allies ?? 0} 个能开口叫的人`,
      need: "填一次底牌快照",
    }),
  },
  {
    key: "res.time",
    main: "RES",
    domain: "self",
    name: "自己的时间",
    // daily_time_blocks 已经在记时间，但它的 category_key 没有区分
    // "自主 / 被占用"。在给出这个区分之前，宁可空着，也不拿一个猜的映射充数。
    build: (input) => ({
      value:
        input.weeklyFreeHours === null
          ? null
          : band(
              input.weeklyFreeHours,
              [
                [3, 3],
                [8, 8],
                [15, 13],
                [25, 17],
              ],
              20
            ),
      sample: input.weeklyFreeHours === null ? 0 : 1,
      basis: `每周 ${input.weeklyFreeHours ?? 0} 小时属于自己`,
      need: "填一次底牌快照",
    }),
  },
];

export const SUB_TOTAL = SUB_SPECS.length;

export function buildPanel(input: PanelInput): Panel {
  const subs: SubAttribute[] = SUB_SPECS.map((spec) => ({
    key: spec.key,
    main: spec.main,
    domain: spec.domain,
    name: spec.name,
    ...spec.build(input),
  }));

  const mains: MainAttribute[] = MAIN_KEYS.map((key) => {
    const own = subs.filter((sub) => sub.main === key);
    const known = own
      .map((sub) => sub.value)
      .filter((value): value is number => value !== null);
    return {
      key,
      name: MAIN_NAMES[key],
      // 同量纲合成：一个主属性的子项都在量同一件事，可以平均。
      // 主属性之间永远不求和 —— 那是把公斤和命中率相加。
      level: known.length > 0 ? Math.round(mean(known)) : null,
      subs: own,
    };
  });

  const domains: DomainCoverage[] = DOMAINS.map((domain) => {
    const own = subs.filter((sub) => sub.domain === domain);
    return {
      domain,
      name: DOMAIN_NAMES[domain],
      lit: own.filter((sub) => sub.value !== null).length,
      total: own.length,
    };
  });

  return {
    mains,
    domains,
    lit: subs.filter((sub) => sub.value !== null).length,
    total: subs.length,
  };
}

/**
 * 特化度：只看已点亮的主属性之间的离散程度。
 * 高特化 = 峰值高但吃环境；均衡 = 天花板低但哪儿都能活。
 * 至少 4 项算得出来才给结论。
 */
export function specialization(panel: Panel): {
  spread: number | null;
  strongest: MainAttribute | null;
  weakest: MainAttribute | null;
} {
  const known = panel.mains.filter(
    (item): item is MainAttribute & { level: number } => item.level !== null
  );
  if (known.length < 4) return { spread: null, strongest: null, weakest: null };

  const values = known.map((item) => item.level);
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  const sorted = [...known].sort((a, b) => b.level - a.level);
  return {
    spread: Math.round(Math.sqrt(variance) * 10) / 10,
    strongest: sorted[0],
    weakest: sorted[sorted.length - 1],
  };
}
