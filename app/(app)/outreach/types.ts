export const USE_CASES = [
  {
    key: "startup",
    label: "验证创业想法",
    hint: "找第一批目标用户，让他们愿意尝试",
  },
  {
    key: "job",
    label: "求职自我推销",
    hint: "联系目标公司的对的人，让他们想见你",
  },
  {
    key: "product",
    label: "推销产品/服务",
    hint: "让潜在客户从「不知道」变成「想了解」",
  },
  {
    key: "self",
    label: "推销自己/个人品牌",
    hint: "让对方记住你，并在需要时想到你",
  },
  {
    key: "persuasion",
    label: "说服他人",
    hint: "谈判、请求、协商——让对方主动愿意",
  },
  {
    key: "other",
    label: "其他",
    hint: "任何需要找对的人说对的话的场景",
  },
] as const;

export type UseCase = (typeof USE_CASES)[number]["key"];

export type AiChallenge = {
  dim: "person" | "place" | "time" | "message";
  user_snapshot: string;
  feedback: string;
  created_at: string;
};

export type OutreachCanvas = {
  id: string;
  user_id: string;
  title: string;
  use_case: UseCase;
  scenario: string;
  source_id: string | null;
  source_type: "idea" | "company" | null;
  person_notes: string;
  place_notes: string;
  time_notes: string;
  message_draft: string;
  ai_challenges: AiChallenge[];
  created_at: string;
  updated_at: string;
};

export const DIM_META = {
  person: {
    emoji: "👤",
    label: "对的人",
    prompts: [
      "你要接触的人是谁？（角色 / 公司规模 / 行业）",
      "你怎么在公开信息中识别出他们？（发了什么内容 / 有什么经历 / 在什么岗位）",
    ],
  },
  place: {
    emoji: "📍",
    label: "对的地方",
    prompts: [
      "他们平时出现在哪里？（群组 / 平台 / 活动 / 特定场合）",
      "他们在什么情境下愿意接收陌生人的信息？",
    ],
  },
  time: {
    emoji: "⏱",
    label: "对的时机",
    prompts: [
      "什么事件或状态出现时接触最有效？",
      "什么时机一定要避免？",
    ],
  },
  message: {
    emoji: "✉️",
    label: "对的信息",
    prompts: [
      "对方最在意 / 最头疼的一件事是什么？",
      "你的第一句话想触发什么感受？（共鸣？好奇？紧迫感？）",
    ],
  },
} as const;

export type Dim = keyof typeof DIM_META;
