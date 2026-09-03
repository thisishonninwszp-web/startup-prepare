// 职业：AI 时代的十一种形状。
//
// 这十一个不是让你挑一个。**它们是用来看你无意中长成了什么形状的。**
// 你点亮的节点会自动落进某几个职业里，然后你多半会看见一件自己不知道的事：
// 你以为在往「装配师」走，实际点亮的全在「鉴伪师」和「翻译官」上。
//
// 所以这里没有"选择职业"这个动作，也不该有 ——
// 选了就变成了一次自述，而自述没有分母。
// 契合度只由已经点亮的节点算出来，每个数字都能点开看到分子分母。
//
// 每个职业有一件**印记**：全树最深的那一层，这辈子点亮两三个就够。

import { SKILL_DEFS } from "./skills";

export type ClassDef = {
  key: string;
  name: string;
  /** 一句话说清这个职业是干什么的。 */
  gloss: string;
  /** 为什么这个职业在 AI 之后才重要，或者才变贵。 */
  why: string;
  /** 构成它的技能。顺序大致从浅到深。 */
  skills: string[];
  /** 印记：只有这一行才有的那件事。 */
  signature: string;
};

export const CLASS_DEFS: ClassDef[] = [
  {
    key: "decomposer",
    name: "拆解师",
    gloss: "把一坨模糊的大事拆成能各自验收的小块",
    why: "AI 能做完每一小块，但没人告诉它块该怎么分。分块的人比做块的人贵。",
    skills: [
      "record",
      "structure",
      "scheduling",
      "processdesign",
      "architecture",
      "delegating",
      "decompose",
    ],
    signature: "handover",
  },
  {
    key: "questioner",
    name: "问询官",
    gloss: "不回答问题，决定该回答哪个问题",
    why: "答案变得免费之后，唯一还贵的是问题。",
    skills: [
      "askbasic",
      "listening",
      "probing",
      "asking",
      "synthesis",
      "interview",
      "framing",
    ],
    signature: "requestion",
  },
  {
    key: "authenticator",
    name: "鉴伪师",
    gloss: "在什么都能被生成的世界里，判断这份东西到底行不行",
    why: "产出爆炸之后，稀缺的不是做，是判断做出来的对不对。",
    skills: [
      "observing",
      "trace",
      "spotfake",
      "reverseeng",
      "testing",
      "experiment",
      "interrogate",
      "acceptance",
    ],
    signature: "judgement",
  },
  {
    key: "translator",
    name: "翻译官",
    gloss: "在两个不互通的世界之间搬运意思，两边都不觉得被简化",
    why: "机器能直译，但把技术说给经营层听、把数字说成决定，仍然只有人做得到。",
    skills: [
      "paraphrase",
      "summarize",
      "explaining",
      "profiling",
      "narrative",
      "managingup",
      "transcode",
    ],
    signature: "settingtone",
  },
  {
    key: "assembler",
    name: "装配师",
    gloss: "用现成零件拼出真能用的东西",
    why: "从零写的人在变少，把现成的东西拼对、拼稳的人在变贵。",
    skills: [
      "toolcraft",
      "coding",
      "debugging",
      "prototyping",
      "reverseeng",
      "ship",
      "architecture",
      "integration",
    ],
    signature: "selfrunning",
  },
  {
    key: "signer",
    name: "署名者",
    gloss: "拍板，然后承担后果",
    why: "AI 什么都能建议，但它不能签字。这是「做分析的人」和「经营层」之间那道线。",
    skills: [
      "statusreport",
      "forecasting",
      "finance",
      "acceptance",
      "crisis",
      "judgement",
      "ownership",
    ],
    signature: "ownership",
  },
  {
    key: "connector",
    name: "接头人",
    gloss: "把该认识的两个人接上，事后两边都谢你",
    why: "信任不能被生成，也不能被外包。",
    skills: [
      "remembernames",
      "coldopen",
      "keepingup",
      "trustbuilding",
      "judgepeople",
      "refer",
      "mediating",
    ],
    signature: "dealmaking",
  },
  {
    key: "nightwatch",
    name: "守夜人",
    gloss: "系统不出事；出事你第一个到",
    why: "自动化越深，出事时懂它的人越少。",
    skills: [
      "backup",
      "testing",
      "redundancy",
      "oncall",
      "automation",
      "systemcraft",
      "crisis",
    ],
    signature: "unattended",
  },
  {
    key: "farmer",
    name: "种地的人",
    gloss: "只做慢变量：写、教、口碑、复利",
    why: "生成的内容越多，长期积累的那一点点信誉越贵。",
    skills: [
      "record",
      "writing",
      "headline",
      "narrative",
      "teachingwrite",
      "keepingup",
      "compounding",
    ],
    signature: "gravity",
  },
  {
    key: "shepherd",
    name: "牧机人",
    gloss: "不再自己干活，放牧一群 agent，管的是编队和纪律",
    why: "一个人指挥十个 agent 的时代，管理学第一次落到个人头上。",
    skills: [
      "explaining",
      "aiorchestration",
      "interrogate",
      "fleet",
      "processdesign",
      "clone",
      "acceptance",
    ],
    signature: "custody",
  },
  {
    key: "archivist",
    name: "记忆管理员",
    gloss: "决定组织记住什么、忘掉什么、什么时候把哪段拿给谁",
    why: "上下文成了生产资料之后，管上下文的人就成了岗位。听着像科幻，其实现在就缺。",
    skills: [
      "record",
      "search",
      "trace",
      "synthesis",
      "silence",
      "humanproof",
      "curation",
    ],
    signature: "retention",
  },
];

const SKILL_KEYS = new Set(SKILL_DEFS.map((def) => def.key));

/** 开发期自检：职业引用的技能必须真的存在。 */
export function unknownClassSkills(): string[] {
  return CLASS_DEFS.flatMap((klass) =>
    [...klass.skills, klass.signature].filter((key) => !SKILL_KEYS.has(key))
  );
}

export type ClassFit = {
  def: ClassDef;
  /** 这个职业的技能里，你入门了几门。 */
  started: number;
  /** 这个职业的技能里，走到精通及以上的几门。 */
  deep: number;
  total: number;
  /** 印记点亮了没有。 */
  signatureLit: boolean;
  /** 离这个职业最近的下一步：还没入门的、最浅的那一门。 */
  nextSkill: string | null;
};

/**
 * 算契合度。
 *
 * 只用「走到第几级」这一个输入，而它来自你写下 proof 点亮的节点 ——
 * 所以这里的每个数字都追得回一次真实的事。
 * 不合成总分：started / deep / total 三个数并列摆着，
 * 谁高谁低你自己看，代码不替你合成一个「契合度 78%」。
 */
export function classFits(
  reachedBySkill: Map<string, number>
): ClassFit[] {
  return CLASS_DEFS.map((def) => {
    const reached = (key: string) => reachedBySkill.get(key) ?? 0;
    const notStarted = def.skills.filter((key) => reached(key) === 0);
    return {
      def,
      started: def.skills.filter((key) => reached(key) >= 1).length,
      deep: def.skills.filter((key) => reached(key) >= 3).length,
      total: def.skills.length,
      signatureLit: reached(def.signature) >= 1,
      nextSkill: notStarted[0] ?? null,
    };
  }).sort((a, b) => b.deep - a.deep || b.started - a.started);
}
