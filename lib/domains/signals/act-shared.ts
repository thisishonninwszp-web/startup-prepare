import type { GapSide } from "./gaps-shared";
import { maskEmail } from "./fake-door-shared";

/**
 * 本周行动：外部信号读了很多，这一页只问一件事 —— 这周往前推哪一格。
 * 由代码按他现在的状态排（不调 AI），只给一件最该做的，后面再列几件；只数次数。
 *
 * 一条差距往前走的几格：听过原话 → 开了假门 → 有人留邮箱 → 联系过 → 变成想法 → 想法里记过验证（真实接触）。
 * 排的道理：离"真实接触"越近的越先做；陌生人留了邮箱不联系，前面全白做。
 */

export type ActDoor = { open: boolean; views: number; signups: number; contacted: number; created_at: string; title: string };

export type ActGap = {
  side: GapSide;
  signal_id: string;
  headline: string;
  /** 听过原话几句；没听过为 null。 */
  quotes: number | null;
  door: ActDoor | null;
  /** 变成的想法（按标题认）和它记过几次验证。 */
  idea: { id: string; validations: number } | null;
};

export type ActSignup = {
  id: string;
  email: string;
  created_at: string;
  doorTitle: string;
  /** 去哪一页联系（差距的假门页或周刊付费版页）。 */
  doorHref: string;
};

export type ActState = {
  today: string;
  gaps: ActGap[];
  /** 留了邮箱、还没联系的（旧的在前）。 */
  uncontacted: ActSignup[];
  /** 到期还没对账的判断几条。 */
  dueJudgments: number;
  /** 这周的周刊：没写 / 写了没发 / 发了。 */
  issue: "none" | "draft" | "published";
  /** 没归档的想法里还缺的信息（截止早的在前）。 */
  infoGaps: { id: string; idea_id: string; idea_title: string; question: string; due_on: string }[];
};

/** 信息缺口离截止还有几天以内，就排进这周要做的事。 */
export const GAP_DUE_SOON_DAYS = 3;

export type ActStep = { key: string; text: string; why: string; href: string; cta: string };

/** 假门开了几天还没什么人看，就该想办法让人看到（放进周刊、投一点广告）。 */
export const DOOR_QUIET_DAYS = 7;
export const DOOR_QUIET_VIEWS = 5;
/** 听到几句原话以上，才值得开假门。 */
export const VOICES_FOR_DOOR = 3;

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

function doorHref(g: Pick<ActGap, "side" | "signal_id">): string {
  return `/signals/gaps/door?side=${g.side}&signal=${g.signal_id}`;
}

function gapStep(g: ActState["infoGaps"][number], today: string): ActStep {
  return {
    key: "info-gap",
    text: `想法「${g.idea_title}」还缺：${g.question}（${g.due_on <= today ? "已经过了截止" : `${g.due_on} 截止`}）`,
    why: "这一样拿到了，才知道该继续还是 Kill。先找真人；找不到就看有没有人已经在花钱的痕迹；真的拿不到，标「拿不到」也是一个结论。",
    href: `/ideas/${g.idea_id}#gaps`,
    cta: "去拿",
  };
}

/** 按优先级排好的几件事（第一件就是这周最该做的）。 */
export function nextSteps(state: ActState): ActStep[] {
  const steps: ActStep[] = [];

  // 1. 有人留了邮箱还没联系：离真实接触只差一封信
  const first = state.uncontacted[0];
  if (first) {
    steps.push({
      key: "contact",
      text: `联系 ${maskEmail(first.email)}（「${first.doorTitle}」上留的邮箱）${state.uncontacted.length > 1 ? `，还有 ${state.uncontacted.length - 1} 个人也没联系` : ""}`,
      why: "陌生人看着价格还留了邮箱，是你现在离真实接触最近的地方。问一句「方便聊 15 分钟吗」，聊完点「联系过了」。",
      href: first.doorHref,
      cta: "去联系",
    });
  }

  // 2. 联系过、也变成了想法，但想法里一次验证都没记：聊到的东西没进决策
  const unrecorded = state.gaps.find((g) => g.door && g.door.contacted > 0 && g.idea && g.idea.validations === 0);
  if (unrecorded?.idea) {
    steps.push({
      key: "record",
      text: `把聊到的记进想法「${unrecorded.headline}」的验证记录`,
      why: "有没有痛、愿不愿付钱，只有记进想法里才算数，到期才能做 Go / Kill。",
      href: `/ideas/${unrecorded.idea.id}`,
      cta: "去记",
    });
  }
  // 联系过、还没变成想法的：变成想法才有地方记验证
  const contactedNoIdea = state.gaps.find((g) => g.door && g.door.contacted > 0 && !g.idea);
  if (contactedNoIdea) {
    steps.push({
      key: "to-idea",
      text: `「${contactedNoIdea.headline}」已经联系过留邮箱的人，把它变成一个想法`,
      why: "变成想法才有地方记验证、写退出条件，到期做 Go / Kill。",
      href: "/signals/gaps",
      cta: "去差距清单",
    });
  }

  // 2.5 想法还缺的信息快到截止（或已经过了）：拿到它才知道继续还是 Kill
  const soon = state.infoGaps.find((g) => daysBetween(state.today, g.due_on) <= GAP_DUE_SOON_DAYS);
  if (soon) {
    steps.push(gapStep(soon, state.today));
  }

  // 3. 到期的判断还没对账
  if (state.dueJudgments > 0) {
    steps.push({
      key: "judgments",
      text: `${state.dueJudgments} 条判断到期了，去对账`,
      why: "不对账，判断力就没有反馈，攒的判断也白押了。",
      href: "/signals/practice",
      cta: "去对账",
    });
  }

  // 4. 这周的周刊还没发：陌生人从这里来
  if (state.issue !== "published") {
    steps.push({
      key: "issue",
      text: state.issue === "draft" ? "这周的周刊写好了还没发" : "这周的周刊还没写",
      why: "朋友圈小，陌生人只会从你写出去的东西里找上门；假门的链接也跟着周刊出去。",
      href: "/signals/issue",
      cta: state.issue === "draft" ? "去发" : "去写",
    });
  }

  // 5. 假门开了一周还没什么人看：问题在流量，不在页面
  const quiet = state.gaps.find(
    (g) => g.door && g.door.open && daysBetween(g.door.created_at, state.today) >= DOOR_QUIET_DAYS && g.door.views < DOOR_QUIET_VIEWS
  );
  if (quiet?.door) {
    steps.push({
      key: "traffic",
      text: `假门「${quiet.door.title}」开了 ${daysBetween(quiet.door.created_at, state.today)} 天，只被看了 ${quiet.door.views} 次`,
      why: "没人看就测不出任何东西。把它放进这周的周刊（note 版会自动带链接），或者考虑投一点广告。",
      href: "/signals/issue",
      cta: "放进周刊",
    });
  }

  // 6. 原话听到不少、还没开假门：拿价格去问陌生人
  const loud = state.gaps
    .filter((g) => !g.door && (g.quotes ?? 0) >= VOICES_FOR_DOOR)
    .sort((a, b) => (b.quotes ?? 0) - (a.quotes ?? 0))[0];
  if (loud) {
    steps.push({
      key: "door",
      text: `「${loud.headline}」听到 ${loud.quotes} 句原话，还没开假门`,
      why: "网上抱怨只算有痛的弱证据；写上价格看陌生人留不留邮箱，才接近「愿付钱」。",
      href: doorHref(loud),
      cta: "开一个假门",
    });
  }

  // 7. 一条都没听过原话：先听
  if (state.gaps.length > 0 && state.gaps.every((g) => g.quotes === null)) {
    steps.push({
      key: "listen",
      text: "差距清单里挑两三条，点「听一听」",
      why: "先知道这边有没有人在为这件事头疼，再决定在哪一条上花力气。",
      href: "/signals/gaps",
      cta: "去差距清单",
    });
  }

  if (steps.length === 0 && state.infoGaps[0]) {
    steps.push(gapStep(state.infoGaps[0], state.today));
  }
  if (steps.length === 0) {
    steps.push({
      key: "idle",
      text: "这周没有卡住的地方：挑一条差距往前推一格",
      why: "听一听、开假门、变成想法，哪一格都行。",
      href: "/signals/gaps",
      cta: "去差距清单",
    });
  }
  return steps;
}

/** 漏斗：每一格有几条差距走到了（只数次数）。 */
export function actFunnel(gaps: ActGap[]): { label: string; count: number }[] {
  return [
    { label: "差距清单", count: gaps.length },
    { label: "听过原话", count: gaps.filter((g) => g.quotes !== null).length },
    { label: "开了假门", count: gaps.filter((g) => g.door).length },
    { label: "有人留邮箱", count: gaps.filter((g) => (g.door?.signups ?? 0) > 0).length },
    { label: "联系过", count: gaps.filter((g) => (g.door?.contacted ?? 0) > 0).length },
    { label: "变成想法", count: gaps.filter((g) => g.idea).length },
    { label: "记过验证", count: gaps.filter((g) => (g.idea?.validations ?? 0) > 0).length },
  ];
}

/** 动过的差距（听过、开过假门、变成过想法），按走到第几格排，走得远的在前。 */
export function movedGaps(gaps: ActGap[]): ActGap[] {
  const depth = (g: ActGap) =>
    (g.quotes !== null ? 1 : 0) +
    (g.door ? 1 : 0) +
    ((g.door?.signups ?? 0) > 0 ? 1 : 0) +
    ((g.door?.contacted ?? 0) > 0 ? 1 : 0) +
    (g.idea ? 1 : 0) +
    ((g.idea?.validations ?? 0) > 0 ? 1 : 0);
  return gaps.filter((g) => depth(g) > 0).sort((a, b) => depth(b) - depth(a));
}
