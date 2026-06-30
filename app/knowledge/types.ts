export const CARD_TYPES = [
  { key: "market", label: "市场事实" },
  { key: "customer", label: "顾客规律" },
  { key: "judgment", label: "判断历史" },
  { key: "domain", label: "领域知识" },
] as const;

export type CardType = (typeof CARD_TYPES)[number]["key"];

export type KnowledgeCard = {
  id: string;
  content: string;
  card_type: CardType;
  tags: string[];
  source_type: "manual" | "extracted";
  source_ref: string | null;
  created_at: string;
};

export const COMPANY_TYPES = [
  { key: "prospect", label: "求职目标" },
  { key: "customer", label: "目标客户" },
  { key: "both", label: "两者皆是" },
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number]["key"];

export type Company = {
  id: string;
  name: string;
  company_type: CompanyType;
  ceo_notes: string;
  created_at: string;
  updated_at: string;
};

export type CompanyEvent = {
  id: string;
  company_id: string;
  year: number | null;
  description: string;
  related_party: string | null;
  created_at: string;
};

export type CompanyNote = {
  id: string;
  company_id: string;
  content: string;
  idea_id: string | null;
  created_at: string;
};

export type CompanyDetail = Company & {
  events: CompanyEvent[];
  notes: CompanyNote[];
};
