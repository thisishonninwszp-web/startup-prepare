// 「这算不算」：把记录口从填空题改成判断题。
//
// 三份档案里最值钱的是 outcome=miss 的窗口 —— 符合条件的情境出现了，
// 而你没动。这种事没有人会主动写下来：你不会，我也不会，谁都不爱记
// 自己怂了的那一刻。所以它只能反过来：系统从你已有的记录里挑出
// 「看起来像那种情境」的事，问你一句 —— 这算不算那一次？
//
// 候选只来自三种已经发生、已经有时间戳的记录：
//   validation  一次真实接触（有人说了有痛/没痛、付/不付）
//   decision    一次 Go/Kill
//   commitment  一条复盘时许下的承诺
// 它们共同点是：都是一个「情境」，而不是一个想法。
//
// 这一层不查库、不判断哪条该配哪个假设 —— 配对是用户点的。
// 它只做一件事：从记录里减掉已经回答过的，剩下的排个序。

export const CANDIDATE_SOURCES = ["validation", "decision", "commitment"] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export type Candidate = {
  source: CandidateSource;
  sourceId: string;
  occurredOn: string;
  /** 一句能读的描述：当时发生了什么。 */
  text: string;
  /** 情境分类的默认值，用户可改。分水岭靠它区分「什么情况下会翻面」。 */
  contextKey: string;
};

/** 已经变成窗口的来源引用，存在 self_windows.source_ref 里。 */
export type SourceRef = { type: CandidateSource; id: string };

export const CANDIDATE_WINDOW_DAYS = 60;

const SIGNAL_TEXT: Record<string, string> = {
  yes: "有",
  no: "没有",
  unsure: "说不准",
};

export function fromValidation(row: {
  id: string;
  idea_title: string;
  has_pain: string;
  will_pay: string;
  note: string | null;
  contacted_at: string;
}): Candidate {
  const pain = SIGNAL_TEXT[row.has_pain] ?? row.has_pain;
  const pay = SIGNAL_TEXT[row.will_pay] ?? row.will_pay;
  return {
    source: "validation",
    sourceId: row.id,
    occurredOn: row.contacted_at.slice(0, 10),
    text: `为「${row.idea_title}」接触了一个人：痛${pain}，付钱${pay}${
      row.note ? `。${row.note}` : ""
    }`,
    contextKey: "和人接触",
  };
}

export function fromDecision(row: {
  id: string;
  idea_title: string;
  verdict: string;
  reason: string | null;
  decided_at: string;
}): Candidate {
  const verdict = row.verdict === "go" ? "推进" : "结束";
  return {
    source: "decision",
    sourceId: row.id,
    occurredOn: row.decided_at.slice(0, 10),
    text: `对「${row.idea_title}」做了决定：${verdict}${
      row.reason ? `。${row.reason}` : ""
    }`,
    contextKey: "做取舍",
  };
}

export function fromCommitment(row: {
  id: string;
  text: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}): Candidate | null {
  // 还没到期、也没完成的承诺，结果未定，问不了「做没做」。
  if (!row.completed_at && (!row.due_at || row.due_at > new Date().toISOString())) {
    return null;
  }
  const kept = Boolean(row.completed_at);
  return {
    source: "commitment",
    sourceId: row.id,
    occurredOn: (row.completed_at ?? row.due_at ?? row.created_at).slice(0, 10),
    text: `复盘时说过：${row.text}${kept ? " —— 做了" : " —— 到期了，没标完成"}`,
    contextKey: "复盘承诺",
  };
}

function refKey(ref: { type: string; id: string }): string {
  return `${ref.type}:${ref.id}`;
}

/**
 * 从候选里减掉已经回答过的。
 *
 * 回答过 = 要么已经成了窗口（source_ref 指向它），要么被标成「不算」。
 * 剩下的按时间倒序：最近的事最好回忆，先问。
 */
export function pendingCandidates(
  candidates: Candidate[],
  answered: SourceRef[],
  skipped: SourceRef[]
): Candidate[] {
  const done = new Set([...answered, ...skipped].map(refKey));
  return candidates
    .filter((item) => !done.has(refKey({ type: item.source, id: item.sourceId })))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
}

/** 把一条已回答的候选写成窗口的情境白描。 */
export function situationFor(candidate: Candidate): string {
  return candidate.text;
}
