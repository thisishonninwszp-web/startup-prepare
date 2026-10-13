import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import {
  draftBayes,
  extractStepEvidence,
  inferNextSteps,
  judgeInferenceSteps,
  planScoutQueries,
  sharpenSteps,
  type JudgedTier,
  type SearchSource,
  type StepEvidence,
} from "@/lib/ai";
import { tavilySearch } from "@/lib/external";
import { getSignalDetail } from "./analysis";
import { fetchArticleBody } from "./article";
import {
  chainTo,
  childrenOf,
  foldIntoSignals,
  clampRatio,
  EVIDENCE_STRENGTHS,
  MAX_INFERENCE_DEPTH,
  priorValue,
  type BayesState,
  type InferenceEvidence,
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

  const claims = chain.map((n) => n.claim);
  const [body, materials] = await Promise.all([
    detail.excerpt ?? fetchArticleBody(detail.url),
    scoutMaterials({ title: detail.title, summary: detail.summary, chain: claims, direction: dir }, chain.at(-1)?.evidence ?? []),
  ]);
  const steps = await inferNextSteps({ title: detail.title, summary: detail.summary, body, chain: claims, direction: dir, materials });

  // 每一步上网查一次，只抽事实（来源和摘录由代码核对）。查不到、没配 Key 都不拦着推论。
  const evidence = await Promise.all(steps.map((s) => findStepEvidence(s.claim, s.query, s.counterQuery)));

  // 写推论的和判可能性的分开：Gemini 给自己写的结论打分几乎一律"较可能"，档位交给 Jev 判。
  // 给 Jev 看的是查到的事实，不是 Gemini 写的"为什么"（那段话最容易把判断往高处带）。
  // Jev 不可用（没配 Key、超时）时退回 Gemini 自己标的档位，并记下来是谁判的。
  let tiers = await judgeWithRetry({ title: detail.title, summary: detail.summary, chain: claims, steps, evidence });

  // 太泛的（不算车轱辘的那几条）打回去写具体一次，再请裁判判一遍；还泛就留着并标出来
  if (tiers) {
    const vagueIdx = steps.map((_, i) => i).filter((i) => tiers![i].vague && !tiers![i].restates && !tiers![i].specifies);
    if (vagueIdx.length > 0) {
      try {
        const sharpened = await sharpenSteps({
          title: detail.title,
          chain: claims,
          steps: vagueIdx.map((i) => ({ claim: steps[i].claim, watch: steps[i].watch })),
        });
        for (const s of sharpened) {
          const i = vagueIdx[s.i];
          steps[i] = { ...steps[i], claim: s.claim, watch: s.watch };
        }
        if (sharpened.length > 0) {
          const rejudged = await judgeWithRetry({
            title: detail.title,
            summary: detail.summary,
            chain: claims,
            steps: sharpened.map((s) => steps[vagueIdx[s.i]]),
            evidence: sharpened.map((s) => evidence[vagueIdx[s.i]]),
          });
          if (rejudged) {
            const next = [...tiers];
            sharpened.forEach((s, k) => (next[vagueIdx[s.i]] = rejudged[k]));
            tiers = next;
          }
        }
      } catch (e) {
        console.error("sharpen failed, keeping vague steps", e);
      }
    }
  }

  // 裁判把每一步分成三种：
  // - 把上一步说得更具体一点（"涨运费 → 大和上调宅急便运费"）：不当新的一步，挪进上一步的"具体可以盯"；
  //   第一层没有上一步可挪，当成换说法处理；
  // - 换个说法、绕回前面（"门票卖得多 → 收入增加"）：丢掉；
  // - 真往下推：留下。
  // 一层全被挑掉时才都留下来并标出来，免得点了"往下推"什么都没有。
  const route = steps.map((_, i) => {
    const t = tiers?.[i];
    if (t?.specifies && parentId) return "fold" as const;
    if (t?.restates || t?.specifies) return "drop" as const;
    return "keep" as const;
  });
  const anyKept = route.includes("keep");
  const base = anyKept
    ? foldIntoSignals(
        nodes,
        parentId,
        steps.filter((_, i) => route[i] === "fold").map((s) => s.claim)
      )
    : nodes;

  const next: InferenceNode[] = [
    ...base,
    ...steps
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !anyKept || route[i] === "keep")
      .map(({ s, i }) => ({
      id: randomUUID(),
      parent_id: parentId,
      depth,
      claim: s.claim,
      why: s.why,
      watch: s.watch,
      likelihood: tiers ? tiers[i].likelihood : s.likelihood,
      judged_by: tiers ? ("jev" as const) : ("gemini" as const),
      unsure: tiers ? tiers[i].unsure : undefined,
      p: tiers ? tiers[i].p : undefined,
      restates: tiers?.[i]?.restates || undefined,
      specifies: tiers?.[i]?.specifies || undefined,
      vague: tiers?.[i]?.vague || undefined,
      direction: dir,
      evidence: evidence[i].length > 0 ? evidence[i] : undefined,
      lens: s.lens,
      basis: s.basis,
    })),
  ];
  await saveTree(signalId, next);
  return next;
}

/** Jev 偶尔超时或网络抖一下：失败了再试一次，还不行才退回 Gemini 自评（页面上会标出来，可以重判）。 */
async function judgeWithRetry(input: Parameters<typeof judgeInferenceSteps>[0]): Promise<JudgedTier[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await judgeInferenceSteps(input);
    } catch (e) {
      console.error(`inference judge failed (attempt ${attempt + 1})`, e);
    }
  }
  return null;
}

/**
 * 请裁判重判：某一层里是 Gemini 自评的那几步，交给 Jev 重新判档（看的还是查到的事实）。
 * 用于 Jev 当时没调通、退回了自评的情况。
 */
export async function rejudgeLayer(
  signalId: string,
  parentId: string | null,
  /** true：这一层全部重判（补上"是不是换说法"的标记）；默认只重判 AI 自评的。 */
  all = false
): Promise<InferenceNode[]> {
  const { detail, nodes } = await loadTree(signalId);
  const targets = childrenOf(nodes, parentId).filter((n) => all || n.judged_by === "gemini");
  if (targets.length === 0) return nodes;
  const tiers = await judgeWithRetry({
    title: detail.title,
    summary: detail.summary,
    chain: chainTo(nodes, parentId).map((n) => n.claim),
    steps: targets.map((n) => ({
      claim: n.claim,
      why: n.why,
      watch: n.watch,
      likelihood: n.likelihood,
      query: "",
      counterQuery: "",
    })),
    evidence: targets.map((n) => n.evidence ?? []),
  });
  if (!tiers) throw new Error("裁判这次也没调通，过一会儿再试");
  const judged = new Map(targets.map((n, i) => [n.id, tiers[i]]));
  const next = nodes.map((n) => {
    const t = judged.get(n.id);
    // 已经在树上的节点只标记、不删（可能押过、算过贝叶斯）
    return t
      ? {
          ...n,
          likelihood: t.likelihood,
          unsure: t.unsure,
          p: t.p,
          restates: t.restates || undefined,
          specifies: t.specifies || undefined,
          judged_by: "jev" as const,
        }
      : n;
  });
  await saveTree(signalId, next);
  return next;
}

/** 正反两个方向各搜几条。只照着推论去搜，搜到的几乎全是支持它的。 */
const SEARCH_RESULTS_PER_SIDE = 3;

/** 推之前每个角度搜几篇；上一步的证据最多带几条；交给写推论的一共最多几份材料。 */
const SCOUT_RESULTS_PER_QUERY = 3;
const SCOUT_PARENT_EVIDENCE = 4;
const MAX_MATERIALS = 12;

/**
 * 推之前先查材料：从"波及别处 / 有人反应 / 以前也有过"三个角度各搜一次，再带上上一步查证时找到的事实。
 * 以前是推完才查、查到的只给裁判看 —— 写推论的那一方只能在链自己的说法里打转，推出来的就是车轱辘。
 * 任何一环失败都只是少了材料，推论照常。
 */
async function scoutMaterials(
  input: { title: string; summary: string; chain: string[]; direction?: string },
  parentEvidence: InferenceEvidence[]
): Promise<SearchSource[]> {
  const fromParent = parentEvidence
    .slice(0, SCOUT_PARENT_EVIDENCE)
    .map((e) => ({ title: e.title, url: e.url, content: `${e.fact}\n${e.excerpt}` }));
  let searched: SearchSource[] = [];
  try {
    const queries = await planScoutQueries(input);
    const results = await Promise.all(queries.map((q) => tavilySearch(q.query, SCOUT_RESULTS_PER_QUERY).catch(() => [])));
    searched = results.flat().filter((r) => r.url && r.content);
  } catch (e) {
    console.error("inference scout failed", e);
  }
  const seen = new Set<string>();
  return [...fromParent, ...searched].filter((m) => !seen.has(m.url) && seen.add(m.url)).slice(0, MAX_MATERIALS);
}

/** 查证一步：正反两个方向各搜一次 → 合起来抽事实。任何一环失败都返回空数组，推论照常。 */
async function findStepEvidence(claim: string, query: string, counterQuery: string): Promise<StepEvidence[]> {
  try {
    const [pro, con] = await Promise.all([
      tavilySearch(query || claim, SEARCH_RESULTS_PER_SIDE).catch(() => []),
      counterQuery ? tavilySearch(counterQuery, SEARCH_RESULTS_PER_SIDE).catch(() => []) : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    const sources = [...pro, ...con].filter((r) => r.url && r.content && !seen.has(r.url) && seen.add(r.url));
    return await extractStepEvidence(claim, sources);
  } catch (e) {
    console.error("step evidence failed", e);
    return [];
  }
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
    // 查到过证据就让草稿优先用它们，而不是凭印象想证据
    found: node.evidence ?? [],
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
      url: typeof e.url === "string" && /^https?:\/\//.test(e.url) ? e.url : undefined,
    })),
    draft: state.draft,
  };
  const next = nodes.map((n) => (n.id === nodeId ? { ...n, bayes: clean } : n));
  await saveTree(signalId, next);
  return next;
}

/** 他标"这是车轱辘"或取消标记。 */
export async function flagNode(signalId: string, nodeId: string, circular: boolean): Promise<InferenceNode[]> {
  const { nodes } = await loadTree(signalId);
  if (!nodes.some((n) => n.id === nodeId)) throw new Error("找不到这一步");
  const next = nodes.map((n) => (n.id === nodeId ? { ...n, userFlag: circular ? ("circular" as const) : undefined } : n));
  await saveTree(signalId, next);
  return next;
}

/**
 * 他标过的车轱辘，连同上一步，拿来重新校准裁判（对比裁判当时怎么判的）。
 * 单用户阶段直接扫全表；条目两周后会被清，所以要校准就趁早导出。
 */
export async function listUserFlaggedSteps(): Promise<{ parent: string; claim: string; judgedAs: string }[]> {
  const { data, error } = await supabaseAdmin.from("external_signals").select("title, inference").not("inference", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const nodes = (row.inference as InferenceNode[] | null) ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return nodes
      .filter((n) => n.userFlag === "circular")
      .map((n) => ({
        parent: n.parent_id ? byId.get(n.parent_id)?.claim ?? "" : `新闻本身：${row.title ?? ""}`,
        claim: n.claim,
        judgedAs: n.restates ? "裁判也判成车轱辘" : n.specifies ? "裁判判成更具体一点" : "裁判漏掉了",
      }));
  });
}
