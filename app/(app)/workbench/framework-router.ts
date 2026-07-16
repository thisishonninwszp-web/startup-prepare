import {
  parseFrameworkRecommendations,
  type FrameworkRecommendation,
  type WorkbenchObjectSignal,
} from "./domain";

type WorkbenchRouterSignal = WorkbenchObjectSignal & {
  sourceRealityVersionId?: string;
};

type FrameworkTemplate = Omit<FrameworkRecommendation, "href"> & {
  href: (signal: WorkbenchRouterSignal, objectId: string) => string;
};

const TEMPLATES: Record<string, FrameworkTemplate> = {
  reality_map: {
    id: "reality_map",
    lane: "see_reality",
    title: "现状地图",
    reason: "当前需要先把事实、解释和未知拆开。",
    opens: "看清哪些是已经发生的事，哪些只是你的解释。",
    blind_spot: "它不能替你证明顾客真的在意。",
    output: "一张可继续引用的现状地图。",
    href: (signal, objectId) =>
      signal.objectType === "reality_case" ? `/reality/${objectId}` : "/reality",
  },
  focused_inquiry: {
    id: "focused_inquiry",
    lane: "see_reality",
    title: "聚焦探索",
    reason: "当前有情绪、矛盾或一个具体点卡住。",
    opens: "围绕地图中的一点区分原文、推断和未知。",
    blind_spot: "它只能处理局部，不会自动形成整体判断。",
    output: "一段可带入收束的聚焦摘要。",
    href: (signal, objectId) =>
      signal.objectType === "reality_case" ? `/reality/${objectId}` : "/reality",
  },
  outside_view: {
    id: "outside_view",
    lane: "test_judgment",
    title: "Outside View",
    reason: "当前解释较多，需要看类似情况通常怎么失败。",
    opens: "把自己从特殊案例里拉出来，看常见失败路径。",
    blind_spot: "它不能替代你自己的真实证据。",
    output: "一个可对账的外部检验行动。",
    href: () => "/reasoning/outside-view/new",
  },
  bayesian: {
    id: "bayesian",
    lane: "test_judgment",
    title: "贝叶斯更新",
    reason: "当前信念被很多解释影响，但证据权重不清。",
    opens: "看清一条证据到底有没有改变你的判断。",
    blind_spot: "它不适合在没有具体信念问题时使用。",
    output: "一个被证据更新过的信念问题。",
    href: () => "/reasoning/bayesian/new",
  },
  fermi: {
    id: "fermi",
    lane: "test_judgment",
    title: "费米估算",
    reason: "当前问题涉及成本、容量、时间或规模。",
    opens: "把模糊感觉拆成数量级和关键变量。",
    blind_spot: "它不能说明人是否真的需要这个东西。",
    output: "一个范围估算和最敏感变量。",
    href: () => "/reasoning/fermi/new",
  },
  reframing: {
    id: "reframing",
    lane: "test_judgment",
    title: "认知重构",
    reason: "当前可能被同一种问法困住。",
    opens: "换一组问题看同一个对象。",
    blind_spot: "它不会自动增加现实证据。",
    output: "一个更值得回答的 Central Question。",
    href: () => "/reasoning/reframing/new",
  },
  customer_view: {
    id: "customer_view",
    lane: "test_judgment",
    title: "顾客视点",
    reason: "当前判断缺少真实顾客材料。",
    opens: "用证据约束的顾客声音检查你的假设。",
    blind_spot: "材料不足时只能说明未知范围。",
    output: "一个顾客研究结论或下一次真实接触问题。",
    href: () => "/customer-view",
  },
  dream_system: {
    id: "dream_system",
    lane: "see_reality",
    title: "梦想系统",
    reason: "当前问题缺少想去哪里的方向感。",
    opens: "先形成未来场景，再回到现实约束。",
    blind_spot: "它不负责替你生成行动计划。",
    output: "一个可与现实对照的愿景版本。",
    href: () => "/dreams",
  },
  decision_closure: {
    id: "decision_closure",
    lane: "close_action",
    title: "统一收束",
    reason: "当前分析需要压缩成一个可对账的下一步。",
    opens: "把判断、未知、选项和唯一下一步放在一起。",
    blind_spot: "它不会替你消除所有不确定性。",
    output: "一个有日期的下一步或正当不行动理由。",
    href: (signal, objectId) => `/workbench/${signal.objectType}/${objectId}`,
  },
  result_learning: {
    id: "result_learning",
    lane: "close_action",
    title: "结果学习",
    reason: "当前下一步已经到期，需要和现实对账。",
    opens: "看清原判断和实际结果之间的差距。",
    blind_spot: "它不负责继续追加新分析。",
    output: "一条判断学习或修正规则。",
    href: (signal, objectId) => `/workbench/${signal.objectType}/${objectId}`,
  },
};

function materialize(
  template: FrameworkTemplate,
  signal: WorkbenchRouterSignal,
  objectId: string
): FrameworkRecommendation {
  let href = template.href(signal, objectId);
  if (
    href.endsWith("/new") &&
    signal.objectType === "reality_case" &&
    signal.sourceRealityVersionId
  ) {
    href = `${href}?reality_version_id=${encodeURIComponent(
      signal.sourceRealityVersionId
    )}`;
  }
  return { ...template, href };
}

function pickSeeReality(signal: WorkbenchRouterSignal): FrameworkTemplate {
  if (signal.needsDirection) return TEMPLATES.dream_system;
  if (signal.hasEmotionOrContradiction) return TEMPLATES.focused_inquiry;
  return TEMPLATES.reality_map;
}

function pickTestJudgment(signal: WorkbenchRouterSignal): FrameworkTemplate {
  if (signal.needsCustomerEvidence) return TEMPLATES.customer_view;
  if (signal.hasQuantitativeQuestion) return TEMPLATES.fermi;
  if (signal.hasEmotionOrContradiction) return TEMPLATES.reframing;
  if (signal.interpretationCount > signal.factCount) return TEMPLATES.outside_view;
  return TEMPLATES.bayesian;
}

function pickCloseAction(signal: WorkbenchRouterSignal): FrameworkTemplate {
  if (signal.isClosureDue) return TEMPLATES.result_learning;
  return TEMPLATES.decision_closure;
}

export function recommendFrameworks(
  signal: WorkbenchRouterSignal & { objectId?: string }
): FrameworkRecommendation[] {
  const objectId = signal.objectId ?? signal.title;
  return parseFrameworkRecommendations([
    materialize(pickSeeReality(signal), signal, objectId),
    materialize(pickTestJudgment(signal), signal, objectId),
    materialize(pickCloseAction(signal), signal, objectId),
  ]);
}
