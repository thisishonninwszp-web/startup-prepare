import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { draftBayes, inferNextSteps, judgeInferenceSteps, type JudgedTier } from "@/lib/ai";
import { getSignalDetail } from "./analysis";
import { fetchArticleBody } from "./article";
import {
  chainTo,
  childrenOf,
  clampRatio,
  EVIDENCE_STRENGTHS,
  MAX_INFERENCE_DEPTH,
  priorValue,
  type BayesState,
  type InferenceNode,
} from "./inference-shared";

/**
 * 往下推：从一条新闻出发，一层一层推后果。按需展开 —— 点哪个节点才推它的下一层，
 * 一次生成整棵树（3 叉 5 层 = 243 个节点）既看不过来也浪费。
 * 可以不给方向（让它自己推），也可以给方向（"往广告行业推""如果日元反而贬值"）。
 * 树存在 external_signals.inference，推过的节点不重复花钱。
 */

const MAX_DIRECTION_LENGTH = 100;

export async function getInference(id: string): Promise<InferenceNode[] | "missing-schema"> {
  const { data, error } = await supabaseAdmin.from("external_signals").select("inference").eq("id", id).maybeSingle();
  if (error) {
    if (/inference/.test(error.message)) return "missing-schema";
    throw new Error(error.message);
  }
  return (data?.inference as InferenceNode[] | null) ?? [];
}

async function loadTree(signalId: string) {
  const detail = await getSignalDetail(signalId);
  if (detail === "missing-schema") throw new Error("迁移还没跑完");
  if (!detail) throw new Error("这条已经不在了（两周没动的会被清掉）");
  const nodes = await getInference(signalId);
  if (nodes === "missing-schema") throw new Error("迁移 058 还没跑");
  return { detail, nodes };
}

async function saveTree(signalId: string, nodes: InferenceNode[]) {
  const { error } = await supabaseAdmin.from("external_signals").update({ inference: nodes }).eq("id", signalId);
  if (error) throw new Error(error.message);
}

/**
 * 推 parentId 的下一层（null = 第一层）。
 * 不给方向：已经推过就直接返回已有的那几条。给了方向：另推一组，标上方向。
 */
export async function expandInference(
  signalId: string,
  parentId: string | null,
  direction?: string
): Promise<InferenceNode[]> {
  const { detail, nodes } = await loadTree(signalId);
  const dir = direction?.trim().slice(0, MAX_DIRECTION_LENGTH) || undefined;

  if (!dir && childrenOf(nodes, parentId).some((n) => !n.direction)) return nodes;

  const chain = chainTo(nodes, parentId);
  if (parentId && chain.length === 0) throw new Error("找不到要往下推的那一步");
  const depth = chain.length + 1;
  if (depth > MAX_INFERENCE_DEPTH) throw new Error(`最多推 ${MAX_INFERENCE_DEPTH} 层`);

  const body = detail.excerpt ?? (await fetchArticleBody(detail.url));
  const claims = chain.map((n) => n.claim);
  const steps = await inferNextSteps({ title: detail.title, summary: detail.summary, body, chain: claims, direction: dir });

  // 写推论的和判可能性的分开：Gemini 给自己写的结论打分几乎一律"较可能"，档位交给 Jev 判。
  // Jev 不可用（没配 Key、超时）时退回 Gemini 自己标的档位，并记下来是谁判的。
  let tiers: JudgedTier[] | null = null;
  try {
    tiers = await judgeInferenceSteps({ title: detail.title, summary: detail.summary, chain: claims, steps });
  } catch (e) {
    console.error("inference judge failed, falling back to generator tiers", e);
  }

  const next: InferenceNode[] = [
    ...nodes,
    ...steps.map((s, i) => ({
      id: randomUUID(),
      parent_id: parentId,
      depth,
      claim: s.claim,
      why: s.why,
      watch: s.watch,
      likelihood: tiers ? tiers[i].likelihood : s.likelihood,
      judged_by: tiers ? ("jev" as const) : ("gemini" as const),
      unsure: tiers ? tiers[i].unsure : undefined,
      direction: dir,
    })),
  ];
  await saveTree(signalId, next);
  return next;
}

/** 贝叶斯草稿：AI 只给粗档（先验五档、证据强度五档），转成可编辑的状态，不落库。 */
export async function draftNodeBayes(signalId: string, nodeId: string): Promise<BayesState> {
  const { detail, nodes } = await loadTree(signalId);
  const chain = chainTo(nodes, nodeId);
  const node = chain[chain.length - 1];
  if (!node || node.id !== nodeId) throw new Error("找不到这一步");
  const input = {
    title: detail.title,
    summary: detail.summary,
    chain: chain.slice(0, -1).map((n) => n.claim),
    claim: node.claim,
  };
  // 草稿偶尔连着两次不合规（比如只给支持的证据），整体再来一轮；还不行就让用户再点一次
  let draft;
  try {
    draft = await draftBayes(input);
  } catch (first) {
    console.error("bayes draft failed once, retrying", first);
    try {
      draft = await draftBayes(input);
    } catch {
      throw new Error("这次 AI 的草稿没过检查（比如只给了支持的证据、没有反方），再点一次试试。");
    }
  }
  return {
    prior: priorValue(draft.prior),
    priorWhy: draft.priorWhy,
    evidence: draft.evidence,
    draft: { prior: draft.prior, evidence: draft.evidence.map((e) => e.strength) },
  };
}

/** 存用户改过的贝叶斯。先验夹在 5%–95%，证据强度只认五档。 */
export async function saveNodeBayes(signalId: string, nodeId: string, state: BayesState): Promise<InferenceNode[]> {
  const { nodes } = await loadTree(signalId);
  if (!nodes.some((n) => n.id === nodeId)) throw new Error("找不到这一步");
  const keys = new Set(EVIDENCE_STRENGTHS.map((s) => s.key));
  const clean: BayesState = {
    prior: Math.min(0.95, Math.max(0.05, Number(state.prior) || 0.5)),
    priorWhy: String(state.priorWhy ?? "").slice(0, 300),
    evidence: (state.evidence ?? []).slice(0, 4).map((e) => ({
      text: String(e.text ?? "").slice(0, 200),
      why: String(e.why ?? "").slice(0, 300),
      strength: keys.has(e.strength) ? e.strength : "neutral",
      ratio: e.ratio !== undefined ? clampRatio(Number(e.ratio)) : undefined,
    })),
    draft: state.draft,
  };
  const next = nodes.map((n) => (n.id === nodeId ? { ...n, bayes: clean } : n));
  await saveTree(signalId, next);
  return next;
}
