import { generateRealityJson } from "./reality";

// ---------------------------------------------------------------------------
// 知识卡片提炼：从验证/文本中找出值得记录的知识点
// ---------------------------------------------------------------------------

export type KnowledgeCardSuggestion = {
  card_type: "market" | "customer" | "judgment" | "domain";
  content: string;
  tags: string[];
};

const KNOWLEDGE_SUGGEST_SYSTEM = `你是一个知识提炼助手。你服务于一个对抗认知偏误的决策系统。
从给定文本中找出值得记录的知识点，每条一句话（20–60字），最多 2 条。
没有值得记录的内容时返回空数组。

card_type 分类规则：
- market：关于市场、行业、竞争格局的客观事实（"B2B SaaS 在日本采购周期约 6 个月"）
- customer：关于目标顾客行为、痛苦、购买决策的规律（"独立开发者不愿付超过 $20/月"）
- judgment：关于你自己的判断模式（"我过去 3 次低估了 B2B 销售难度"）
- domain：领域方法论或通用知识（"做到 PMF 通常需要至少 50 次用户访谈"）

铁律：只提炼事实和规律，绝不评价（禁止输出"有潜力""不错""值得做"）。

只输出 JSON：{"cards":[{"card_type":"...","content":"...","tags":["..."]}]}
不要输出 JSON 以外的任何文字。`;

function parseKnowledgeSuggestions(raw: unknown): KnowledgeCardSuggestion[] {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as Record<string, unknown>).cards)
  ) {
    return [];
  }
  const cards = (raw as { cards: unknown[] }).cards;
  return cards
    .filter(
      (c): c is KnowledgeCardSuggestion =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as KnowledgeCardSuggestion).card_type === "string" &&
        typeof (c as KnowledgeCardSuggestion).content === "string" &&
        Array.isArray((c as KnowledgeCardSuggestion).tags)
    )
    .slice(0, 2);
}

export async function suggestKnowledgeCards(
  context: string
): Promise<KnowledgeCardSuggestion[]> {
  try {
    const result = await generateRealityJson(
      KNOWLEDGE_SUGGEST_SYSTEM,
      `文本：${context}`,
      parseKnowledgeSuggestions
    );
    return result;
  } catch {
    return [];
  }
}

