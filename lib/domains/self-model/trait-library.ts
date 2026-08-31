// 特性库:26 根互斥光谱 × 两端 = 52 条预定义特性。
//
// 这一层存在的理由:特性必须是**长出来的**，不是手写的。
// 手写等于让人给自己发勋章，前面定的"AI 只有提名权"就是句空话。
//
// 每根光谱绑定一个子属性，所以授予完全由代码判定 —— 连 AI 都不需要出场：
//   子属性 ≤ 低阈值  → 授予负端
//   子属性 ≥ 高阈值  → 授予正端
//   中间           → 常人，不发（这一档空着才是常态）
//   掉回中间       → 褪色
//
// 防通胀靠互斥:一根光谱同时只能持有一条（数据库唯一索引），
// 稀缺来自互斥，不来自配额喊话。
//
// 名字刻意用能伸手摸到的东西 —— 铁匠铺、酒馆、粮仓、塔、井、号角。
// 规模停在冒险者小队，不上升到神明:被叫「半座桥」你会笑，
// 写「执行力不足」你会想关掉这个应用。

import type { Panel } from "./panel";
import type { TraitModifier } from "./traits";

export type Pole = "negative" | "positive";

export type LibraryTrait = {
  key: string;
  spectrumKey: string;
  pole: Pole;
  name: string;
  /** 一句话解释这个名字，只在界面上给人看。 */
  gloss: string;
  /** 读哪个子属性。 */
  reads: string;
  modifiers: TraitModifier[];
  /** 双刃必须有反噬条件，否则 traits.ts 不给它暗金。 */
  backfire?: string;
  equipNote?: string;
  /** ⚖️ 两端都不是缺陷也不是优点，只发普通档。 */
  neutral?: boolean;
};

const LOW = 6;
const HIGH = 15;

export const TRAIT_THRESHOLDS = { low: LOW, high: HIGH } as const;

function pair(
  spectrumKey: string,
  reads: string,
  negative: Omit<LibraryTrait, "key" | "spectrumKey" | "pole" | "reads">,
  positive: Omit<LibraryTrait, "key" | "spectrumKey" | "pole" | "reads">
): LibraryTrait[] {
  return [
    { key: `${spectrumKey}-`, spectrumKey, pole: "negative", reads, ...negative },
    { key: `${spectrumKey}+`, spectrumKey, pole: "positive", reads, ...positive },
  ];
}

const minus = (sub: string, note: string): TraitModifier => ({
  sub,
  sign: "minus",
  note,
});
const plus = (sub: string, note: string): TraitModifier => ({
  sub,
  sign: "plus",
  note,
});

export const TRAIT_LIBRARY: LibraryTrait[] = [
  // ---------------- 工作 ----------------
  ...pair(
    "开工",
    "dex.ignition",
    {
      name: "湿柴",
      gloss: "总要先预热三小时",
      modifiers: [minus("dex.ignition", "点不着")],
    },
    {
      name: "火折子",
      gloss: "想到就动手",
      modifiers: [
        plus("dex.ignition", "一擦就着"),
        minus("wis.contact", "快到来不及先问一句"),
      ],
      backfire: "需求靠自己认定时，动手越快错得越远",
      equipNote: "在需求已经明确的活上是纯资产",
    }
  ),
  ...pair(
    "迭代",
    "dex.iteration",
    {
      name: "一炉定型",
      gloss: "指望一次成器",
      modifiers: [minus("dex.iteration", "只出一版")],
    },
    { name: "千锤手", gloss: "改到对为止", modifiers: [plus("dex.iteration", "反复回炉")] }
  ),
  ...pair(
    "战线",
    "dex.parallel",
    { name: "独锋", gloss: "一次只打一处", modifiers: [minus("dex.parallel", "同时只开一件")], neutral: true },
    {
      name: "多头蛇",
      gloss: "同时开好几件",
      modifiers: [
        plus("dex.parallel", "并行度高"),
        minus("wil.span", "每件都熬不到底"),
      ],
      backfire: "并行数超过 3 时，每件的最长跨度都被砍短",
      equipNote: "在探索期是资产，进交付期是负债",
      neutral: true,
    }
  ),
  ...pair(
    "校准",
    "int.calibration",
    { name: "摇骰子", gloss: "把握度全凭感觉", modifiers: [minus("int.calibration", "命中率低")] },
    { name: "测风者", gloss: "说八成就是八成", modifiers: [plus("int.calibration", "押得准")] }
  ),
  ...pair(
    "复错",
    "int.repeat",
    { name: "鬼打墙", gloss: "绕回同一个坑", modifiers: [minus("int.repeat", "学到了在重复")] },
    { name: "刻碑人", gloss: "学一次就刻死", modifiers: [plus("int.repeat", "不重复犯")] }
  ),
  ...pair(
    "学用",
    "int.transfer",
    { name: "藏经阁", gloss: "存了一屋子没翻过", modifiers: [minus("int.transfer", "学了不用")] },
    { name: "野路子", gloss: "边做边补", modifiers: [plus("int.transfer", "学完就用上")] }
  ),
  ...pair(
    "接触",
    "wis.contact",
    {
      name: "塔中人",
      gloss: "关在塔里做东西",
      modifiers: [
        minus("wis.contact", "很少问真人"),
        plus("dex.iteration", "不等回复所以转得快"),
      ],
      backfire: "需求 100% 自我认定时，转得越快离得越远",
      equipNote: "在需求已知的活上，独处产出确实更高",
    },
    { name: "游商", gloss: "到处问、到处换", modifiers: [plus("wis.contact", "接触密度高")] }
  ),
  ...pair(
    "诚实",
    "wis.candor",
    { name: "喜鹊", gloss: "只报喜", modifiers: [minus("wis.candor", "不利证据记得少")] },
    { name: "验尸官", gloss: "敢看难看的那一面", modifiers: [plus("wis.candor", "对己不利的照记")] }
  ),
  ...pair(
    "纳谏",
    "wis.persuadable",
    {
      name: "铁头盔",
      gloss: "听不进去",
      modifiers: [
        minus("wis.persuadable", "被反驳也不改"),
        plus("wil.restraint", "不容易被带跑"),
      ],
      backfire: "反驳来自比你懂的人时，这顶头盔是纯亏",
      neutral: true,
    },
    {
      name: "风向旗",
      gloss: "谁说都听",
      modifiers: [
        plus("wis.persuadable", "改得快"),
        minus("wil.restraint", "容易被带着开新坑"),
      ],
      backfire: "没有自己的判断时，改得快只是被最后一个说话的人牵着走",
      neutral: true,
    }
  ),
  ...pair(
    "收敛",
    "wil.closure",
    {
      name: "半座桥",
      gloss: "起了头没收尾",
      modifiers: [
        minus("wil.closure", "走到结论的少"),
        plus("dex.iteration", "不恋战，转得快"),
      ],
      backfire: "需要交付的环境里是纯负债",
      equipNote: "在纯探索期，不恋战确实省时间",
    },
    { name: "封顶匠", gloss: "起的头都封了顶", modifiers: [plus("wil.closure", "都走到 Go/Kill")] }
  ),
  ...pair(
    "熬功",
    "wil.span",
    { name: "篝火客", gloss: "只坐一夜就走", modifiers: [minus("wil.span", "跨度短")] },
    {
      name: "掘井人",
      gloss: "下去就不上来",
      modifiers: [
        plus("wil.span", "单主题投入极长"),
        minus("lck.newcontext", "一直待在同一口井里"),
      ],
      backfire: "井挖到一半发现没水时，沉没成本最难放手",
      equipNote: "在方向已验证过的事上是纯资产",
    }
  ),
  ...pair(
    "克制",
    "wil.restraint",
    { name: "捡石头", gloss: "见亮的就捡", modifiers: [minus("wil.restraint", "新坑开得勤")] },
    { name: "压舱石", gloss: "按得住手", modifiers: [plus("wil.restraint", "很少开新坑")] }
  ),
  ...pair(
    "采纳",
    "cha.adoption",
    { name: "空谷回音", gloss: "喊完只有回声", modifiers: [minus("cha.adoption", "提议少被接受")] },
    { name: "铜锣手", gloss: "一敲全场都听见", modifiers: [plus("cha.adoption", "提议多被接受")] }
  ),
  ...pair(
    "曝光",
    "cha.exposure",
    { name: "地窖", gloss: "做完了也不给人看", modifiers: [minus("cha.exposure", "半成品不外露")] },
    { name: "摆摊人", gloss: "没做完就摆出来", modifiers: [plus("cha.exposure", "早早给人看")] }
  ),
  ...pair(
    "承诺",
    "cha.commitment",
    { name: "赊账", gloss: "总说回头再说", modifiers: [minus("cha.commitment", "兑现率低")] },
    { name: "押印", gloss: "说了就盖章", modifiers: [plus("cha.commitment", "承诺都兑现")] }
  ),

  // ---------------- 身体 ----------------
  ...pair(
    "力量",
    "str.absolute",
    { name: "木剑", gloss: "还在用练习剑", modifiers: [minus("str.absolute", "力量没长")] },
    { name: "扛石人", gloss: "一直在加片", modifiers: [plus("str.absolute", "力量在涨")] }
  ),
  ...pair(
    "训练量",
    "str.volume",
    { name: "一炷香", gloss: "进去一会儿就走", modifiers: [minus("str.volume", "容量小")] },
    { name: "铁砧", gloss: "扛得住量", modifiers: [plus("str.volume", "周吨位高")] }
  ),
  ...pair(
    "有氧",
    "con.aerobic",
    { name: "一里路", gloss: "跑一里就喘", modifiers: [minus("con.aerobic", "有氧少")] },
    { name: "驿马", gloss: "跑起来不停", modifiers: [plus("con.aerobic", "有氧足")] }
  ),
  ...pair(
    "出勤",
    "con.regular",
    { name: "荒场", gloss: "练武场空着", modifiers: [minus("con.regular", "去得少")] },
    { name: "日课僧", gloss: "风雨无阻", modifiers: [plus("con.regular", "出勤稳")] }
  ),

  // ---------------- 自己 / 人际 ----------------
  ...pair(
    "睡眠",
    "con.sleep",
    { name: "夜枭", gloss: "睡够七小时的夜很少", modifiers: [minus("con.sleep", "睡眠债高")] },
    { name: "晨钟", gloss: "睡得够也睡得准", modifiers: [plus("con.sleep", "睡眠稳")] }
  ),
  ...pair(
    "结识",
    "lck.newfaces",
    { name: "常客", gloss: "永远同一张桌", modifiers: [minus("lck.newfaces", "新面孔少")] },
    { name: "串门", gloss: "见谁聊谁", modifiers: [plus("lck.newfaces", "新面孔多")] }
  ),
  ...pair(
    "场子",
    "lck.newcontext",
    { name: "旧地图", gloss: "只玩打熟的那几张图", modifiers: [minus("lck.newcontext", "情境少")] },
    { name: "探路人", gloss: "一直在开图", modifiers: [plus("lck.newcontext", "情境多")] }
  ),
  ...pair(
    "意外",
    "lck.serendipity",
    { name: "无风带", gloss: "什么都不会撞上来", modifiers: [minus("lck.serendipity", "意外收获少")] },
    { name: "拾获者", gloss: "总能捡到东西", modifiers: [plus("lck.serendipity", "意外收获多")] }
  ),
  ...pair(
    "余裕",
    "res.runway",
    { name: "空仓", gloss: "粮仓见底", modifiers: [minus("res.runway", "跑道短")] },
    { name: "粮草官", gloss: "粮草充足", modifiers: [plus("res.runway", "跑道长")] }
  ),
  ...pair(
    "援军",
    "res.allies",
    { name: "独狼", gloss: "没人可叫", modifiers: [minus("res.allies", "可动员的人少")] },
    { name: "持号角", gloss: "吹了会有人来", modifiers: [plus("res.allies", "可动员的人多")] }
  ),
  ...pair(
    "时间",
    "res.time",
    { name: "无自留地", gloss: "一周没几个钟头是自己的", modifiers: [minus("res.time", "可支配时间少")] },
    { name: "闲庭", gloss: "有整块属于自己的时间", modifiers: [plus("res.time", "可支配时间多")] }
  ),

  // ---------------- 项目内部其它模块接进来的 ----------------
  ...pair(
    "识破",
    "int.decoy",
    { name: "照单全收", gloss: "埋好的坑都踩了", modifiers: [minus("int.decoy", "识破率低")] },
    { name: "挑刺的眼", gloss: "一眼看出哪里不对", modifiers: [plus("int.decoy", "识破率高")] }
  ),
  ...pair(
    "对账",
    "wil.precommit",
    { name: "翻篇", gloss: "事前写的条件事后不看", modifiers: [minus("wil.precommit", "很少回头对照")] },
    { name: "照单核对", gloss: "写下的条件逐条兑现", modifiers: [plus("wil.precommit", "都回头对照过")] }
  ),
  ...pair(
    "灰色",
    "res.gray",
    { name: "雾里的钟点", gloss: "一周有大段说不清去哪了", modifiers: [minus("res.gray", "灰色时间多")] },
    { name: "账目清楚", gloss: "时间去哪了说得出来", modifiers: [plus("res.gray", "灰色时间少")] }
  ),
];


// ---------------------------------------------------------------------------
// 组合特性
//
// 拨杆那 52 条只能说"某项高/某项低"。真正有意思的关于一个人的话，
// 几乎都是两三项**同时成立**才成立的 —— 熬功高本身没什么，
// 熬功高加上接触低，才是「地窖酿酒师」。
//
// 组合不占光谱，所以不受互斥限制；它们靠条件本身自限：
// 要两三个子属性同时踩到端点，本来就不容易。
// ---------------------------------------------------------------------------

export type ComboCondition = {
  sub: string;
  op: "gte" | "lte";
  value: number;
};

export type ComboTrait = {
  key: string;
  name: string;
  gloss: string;
  conditions: ComboCondition[];
  modifiers: TraitModifier[];
  backfire?: string;
  /** ⚠️ 报警型：集齐不是奖励，是提醒。 */
  alarm?: boolean;
};

const hi = (sub: string): ComboCondition => ({ sub, op: "gte", value: HIGH });
const lo = (sub: string): ComboCondition => ({ sub, op: "lte", value: LOW });

export const COMBO_LIBRARY: ComboTrait[] = [
  {
    key: "combo.cellar",
    name: "地窖酿酒师",
    gloss: "埋头酿得很深，没人尝过",
    conditions: [hi("wil.span"), lo("wis.contact")],
    modifiers: [plus("wil.span", "深度"), minus("cha.exposure", "无人品尝")],
    backfire: "酿到一半发现没人喝时，最难放手",
  },
  {
    key: "combo.fivewells",
    name: "同时挖五口井",
    gloss: "每口都按 180 天的方式挖",
    conditions: [hi("dex.parallel"), hi("wil.span")],
    modifiers: [plus("dex.parallel", "并行"), minus("wil.closure", "全是半成品")],
    backfire: "并行数超过 3 时，每口井都挖不到水",
    alarm: true,
  },
  {
    key: "combo.lightnocook",
    name: "起灶不掌勺",
    gloss: "点火极快，收尾没有",
    conditions: [hi("dex.ignition"), lo("wil.closure")],
    modifiers: [plus("dex.ignition", "起手快"), minus("wil.closure", "收不了尾")],
    backfire: "需要交付的环境里，点得越快亏得越多",
    alarm: true,
  },
  {
    key: "combo.clearvoiceless",
    name: "看得清喊不动",
    gloss: "判断准，推不动人",
    conditions: [hi("wis.candor"), lo("cha.adoption")],
    modifiers: [plus("wis.candor", "看得清"), minus("cha.adoption", "没人动")],
  },
  {
    key: "combo.loudwrong",
    name: "嗓门大过准头",
    gloss: "说服力强，但估不准 —— 最危险的一种",
    conditions: [hi("cha.adoption"), lo("int.calibration")],
    modifiers: [plus("cha.adoption", "推得动"), minus("int.calibration", "押不准")],
    backfire: "别人照你说的做了，而你算错了",
    alarm: true,
  },
  {
    key: "combo.millstone",
    name: "空转的磨盘",
    gloss: "一直在转，没磨出面",
    conditions: [hi("dex.iteration"), lo("wil.closure")],
    modifiers: [plus("dex.iteration", "转得快"), minus("wil.closure", "没出成品")],
    alarm: true,
  },
  {
    key: "combo.emptygranary",
    name: "守着空粮仓",
    gloss: "很能忍，但仓里没粮",
    conditions: [hi("wil.restraint"), lo("res.runway")],
    modifiers: [plus("wil.restraint", "按得住"), minus("res.runway", "跑道短")],
    alarm: true,
  },
  {
    key: "combo.onearmed",
    name: "独臂铁匠",
    gloss: "全靠自己一双手",
    conditions: [hi("wil.span"), lo("res.allies")],
    modifiers: [plus("wil.span", "自己扛"), minus("res.allies", "没人可叫")],
    backfire: "一病就全停",
  },
  {
    key: "combo.nightlamp",
    name: "夜里的灯",
    gloss: "进度是熬出来的",
    conditions: [hi("wil.span"), lo("con.sleep")],
    modifiers: [plus("wil.span", "熬得住"), minus("con.sleep", "睡眠债")],
    backfire: "债总要还，而且是连本带利",
    alarm: true,
  },
  {
    key: "combo.allplans",
    name: "满手计划",
    gloss: "开得多，结的少",
    conditions: [hi("dex.parallel"), lo("wil.closure")],
    modifiers: [plus("dex.parallel", "并行"), minus("wil.closure", "收敛低")],
    alarm: true,
  },
  {
    key: "combo.knocknodoor",
    name: "走遍全城不敲门",
    gloss: "认识很多人，没人替你办事",
    conditions: [hi("lck.newfaces"), lo("cha.adoption")],
    modifiers: [plus("lck.newfaces", "面孔多"), minus("cha.adoption", "没人动")],
  },
  {
    key: "combo.hoardnomarch",
    name: "屯粮不出兵",
    gloss: "粮草足，就是不发兵",
    conditions: [hi("res.runway"), lo("dex.ignition")],
    modifiers: [plus("res.runway", "余裕"), minus("dex.ignition", "不动手")],
    backfire: "跑道最长的时候不动，等短了更不敢动",
  },
  {
    key: "combo.seesnocount",
    name: "会看不会算",
    gloss: "敢看坏消息，但估不准",
    conditions: [hi("wis.candor"), lo("int.calibration")],
    modifiers: [plus("wis.candor", "敢看"), minus("int.calibration", "算不准")],
  },
  {
    key: "combo.emptyhammer",
    name: "铁砧上的空锤",
    gloss: "练得很多，力气没长",
    conditions: [hi("str.volume"), lo("str.absolute")],
    modifiers: [plus("str.volume", "量够"), minus("str.absolute", "没进步")],
    alarm: true,
  },
  {
    key: "combo.nomap",
    name: "跑得快没带地图",
    gloss: "动手极快，场子只有那几个",
    conditions: [hi("dex.ignition"), lo("lck.newcontext")],
    modifiers: [plus("dex.ignition", "起手快"), minus("lck.newcontext", "情境少")],
  },
  {
    key: "combo.debtor",
    name: "债主的常客",
    gloss: "认识越多，欠得越多",
    conditions: [hi("lck.newfaces"), lo("cha.commitment")],
    modifiers: [plus("lck.newfaces", "面孔多"), minus("cha.commitment", "兑现低")],
    backfire: "圈子越大，欠账被看见得越快",
    alarm: true,
  },
  {
    key: "combo.wellbooks",
    name: "井底的藏书",
    gloss: "读了很多，用在同一口井里",
    conditions: [hi("wil.span"), lo("int.transfer")],
    modifiers: [plus("wil.span", "钻得深"), minus("int.transfer", "学了不用")],
  },
  {
    key: "combo.unheardbell",
    name: "无人应答的钟",
    gloss: "一直在敲，没人来",
    conditions: [hi("cha.exposure"), lo("cha.adoption")],
    modifiers: [plus("cha.exposure", "敢给人看"), minus("cha.adoption", "没人接")],
  },
  {
    key: "combo.veteranmap",
    name: "熟地图上的老兵",
    gloss: "在同一张图上打了很久",
    conditions: [hi("wil.span"), lo("lck.newcontext")],
    modifiers: [plus("wil.span", "耐得住"), minus("lck.newcontext", "没换过场子")],
    backfire: "这张图打完之后，没有第二张",
  },
  {
    key: "combo.scavenger",
    name: "拾荒者的仓库",
    gloss: "什么都捡，什么都不用",
    conditions: [lo("wil.restraint"), lo("int.transfer")],
    modifiers: [minus("wil.restraint", "见亮就捡"), minus("int.transfer", "捡了不用")],
    alarm: true,
  },
  {
    key: "combo.rightunheard",
    name: "铁口无人听",
    gloss: "算得准，没人听",
    conditions: [hi("int.calibration"), lo("cha.adoption")],
    modifiers: [plus("int.calibration", "押得准"), minus("cha.adoption", "推不动")],
  },
  {
    key: "combo.deafsmith",
    name: "闭耳的铁匠",
    gloss: "手艺在长，反话进不来",
    conditions: [hi("wil.span"), lo("wis.persuadable")],
    modifiers: [plus("wil.span", "沉得住"), minus("wis.persuadable", "听不进")],
    backfire: "方向错的时候，越沉得住亏得越大",
    alarm: true,
  },
];

export const COMBO_TOTAL = COMBO_LIBRARY.length;

/** 组合不占光谱，用一个带前缀的假光谱名，避开互斥索引。 */
export function comboSpectrumKey(combo: ComboTrait): string {
  return `组合·${combo.name}`;
}

function comboQualifies(
  combo: ComboTrait,
  subs: Map<string, { value: number | null }>
): boolean {
  return combo.conditions.every((condition) => {
    const sub = subs.get(condition.sub);
    if (!sub || sub.value === null) return false;
    return condition.op === "gte"
      ? sub.value >= condition.value
      : sub.value <= condition.value;
  });
}

export const LIBRARY_TOTAL = TRAIT_LIBRARY.length;
export const SPECTRUM_TOTAL = new Set(
  TRAIT_LIBRARY.map((item) => item.spectrumKey)
).size;

export function findLibraryTrait(key: string): LibraryTrait | undefined {
  return TRAIT_LIBRARY.find((item) => item.key === key);
}

/**
 * 一条特性的强度：它绑定的那个子属性现在是多少。
 * 特性本来就有数值 —— 它就是把一个带分母的数字换成一个能记住的名字。
 * 「塔中人 3」和「接触密度 3」是同一件事，但前者你说得出口。
 */
export function traitStrength(
  libraryKey: string,
  subValues: Record<string, number | null>
): number | null {
  const dial = TRAIT_LIBRARY.find((item) => item.key === libraryKey);
  if (dial) return subValues[dial.reads] ?? null;
  const combo = COMBO_LIBRARY.find((item) => item.key === libraryKey);
  if (!combo) return null;
  // 组合的强度取决于最弱的那个条件 —— 木桶原理，短板决定它成不成立。
  const values = combo.conditions.map((condition) => subValues[condition.sub]);
  if (values.some((value) => value === null || value === undefined)) return null;
  return Math.min(...(values as number[]));
}

export type ScanGrant =
  | { kind: "dial"; def: LibraryTrait }
  | { kind: "combo"; def: ComboTrait };

export type ScanResult = {
  /** 该发但还没持有的。 */
  grant: LibraryTrait[];
  /** 该发的组合特性。 */
  combos: ComboTrait[];
  /** 已持有但数值掉回中间区、该褪色的。 */
  fade: { key: string; name: string; reason: string }[];
  /** 已经对上、不用动的。 */
  keep: string[];
};

/**
 * 扫描一遍面板，算出该发什么、该撤什么。
 * 纯函数：不碰数据库，不叫 AI，同样的输入永远同样的输出。
 */
export function scanLibrary(
  panel: Panel,
  held: { libraryKey: string | null; spectrumKey: string }[]
): ScanResult {
  const subs = new Map(
    panel.mains.flatMap((main) => main.subs.map((sub) => [sub.key, sub]))
  );
  const heldByKey = new Map(
    held
      .filter((item) => item.libraryKey)
      .map((item) => [item.libraryKey as string, item])
  );
  const occupiedSpectra = new Set(held.map((item) => item.spectrumKey));

  const grant: LibraryTrait[] = [];
  const combos: ComboTrait[] = [];
  const fade: ScanResult["fade"] = [];
  const keep: string[] = [];

  for (const def of TRAIT_LIBRARY) {
    const sub = subs.get(def.reads);
    const isHeld = heldByKey.has(def.key);
    // 样本不够就当没这回事：没有分母的时候，既不发也不撤。
    if (!sub || sub.value === null) {
      if (isHeld) {
        fade.push({
          key: def.key,
          name: def.name,
          reason: `${def.reads} 的样本已经不足，撤回等重新举证`,
        });
      }
      continue;
    }

    const qualifies =
      def.pole === "negative" ? sub.value <= LOW : sub.value >= HIGH;

    if (qualifies) {
      if (isHeld) keep.push(def.key);
      else if (!occupiedSpectra.has(def.spectrumKey)) grant.push(def);
      continue;
    }
    if (isHeld) {
      fade.push({
        key: def.key,
        name: def.name,
        reason: `${sub.name} 回到 ${sub.value}，已在常人区`,
      });
    }
  }

  for (const combo of COMBO_LIBRARY) {
    const isHeld = heldByKey.has(combo.key);
    const qualifies = comboQualifies(combo, subs);
    if (qualifies) {
      if (isHeld) keep.push(combo.key);
      else combos.push(combo);
      continue;
    }
    if (isHeld) {
      fade.push({
        key: combo.key,
        name: combo.name,
        reason: "组合条件已经不同时成立",
      });
    }
  }

  return { grant, combos, fade, keep };
}
