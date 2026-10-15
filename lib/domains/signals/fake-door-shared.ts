import type { GapSide } from "./gaps-shared";

/**
 * 假门测试：浏览器端也要用的部分（叫法、页面上的固定文字、格式检查）。不碰数据库、不碰 AI。
 *
 * 差距清单里的一条，做一页"准备中的服务"，写明预计价格，陌生人可以留邮箱"做出来了告诉我"。
 * 没有人脉时，陌生人看到价格还愿意留邮箱，是"愿付钱"最近的证据；留了邮箱的人就是可以约来聊的人。
 * 页面必须诚实：还没有这个服务、现在不收钱、邮箱只用来联系一次 —— 这几句由代码加，不让 AI 写、也不让改。
 */

export type DoorLang = "ja" | "zh";

/** 日本这边（中国→日本、美国→日本）用日文页，中国这边（日本→中国）用中文页。 */
export function doorLang(side: GapSide): DoorLang {
  return side === "china" ? "zh" : "ja";
}

/** AI 起草的那几格。 */
export type FakeDoorDraft = { title: string; lead: string; points: string[]; audience: string };

/** 页面上的全部可改文字：AI 起草的那几格 + 他自己填的价格和运营者。 */
export type FakeDoorContent = FakeDoorDraft & {
  /** 预计价格（"月額 980円"）：必须写，陌生人看着价格还愿意留邮箱才有意思。 */
  price: string;
  /** 谁在做（名字、X / note 账号）；不填写"个人筹备中"。 */
  operator: string;
};

/** 每格多长（AI 起草按这个写，他改的时候也按这个查）。 */
export const DOOR_LIMITS = { title: 30, lead: 120, point: 40, audience: 40, price: 30, operator: 60, points: 5 } as const;

/** 他保存时的检查：返回整理好的内容，或者哪里不对。 */
export function validDoorContent(raw: unknown): FakeDoorContent | string {
  const v = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const points = (Array.isArray(v.points) ? v.points : [])
    .filter((p): p is string => typeof p === "string" && !!p.trim())
    .map((p) => p.trim());
  const content: FakeDoorContent = {
    title: str("title"),
    lead: str("lead"),
    points,
    audience: str("audience"),
    price: str("price"),
    operator: str("operator"),
  };
  if (!content.title) return "标题没写";
  if (!content.lead) return "说明没写";
  if (content.points.length === 0) return "用起来是什么样，至少写一条";
  if (!content.price) return "价格要写 —— 陌生人看着价格还愿意留邮箱，才算愿付钱的证据";
  if (!/\d/.test(content.price)) return "价格里要有数字（例：月額 980円）";
  if (content.title.length > DOOR_LIMITS.title + 10) return "标题太长";
  if (content.lead.length > DOOR_LIMITS.lead + 80) return "说明太长";
  if (content.points.length > DOOR_LIMITS.points) return `最多 ${DOOR_LIMITS.points} 条`;
  if (content.points.some((p) => p.length > DOOR_LIMITS.point + 40)) return "有一条太长";
  if (content.audience.length > DOOR_LIMITS.audience + 40) return "适合谁那句太长";
  if (content.price.length > DOOR_LIMITS.price) return "价格那格太长";
  if (content.operator.length > DOOR_LIMITS.operator) return "运营者那格太长";
  return content;
}

/** 公开页上的固定文字（诚实的说明、隐私、表单）。由代码加，不让 AI 写。 */
export const DOOR_TEXT = {
  ja: {
    badge: "準備中",
    notice:
      "このサービスはまだありません。作るかどうかを決めるために、使いたい人がどれくらいいるかを調べています。いま登録しても、お金は一切かかりません。",
    price: "予定価格",
    audience: "こんな方に",
    email: "メールアドレス",
    note: "どんな場面で使いたいですか？（任意）",
    submit: "始まったら知らせてほしい",
    submitting: "送信中…",
    privacy:
      "メールアドレスは、このサービスを始めるとき、または作らないと決めたときに、一度だけご連絡するためにだけ使います。ほかの目的には使いません。登録後に表示されるリンクから、いつでも取り消せます。",
    operator: "運営",
    operatorFallback: "個人で準備しています",
    thanks: "登録しました。ありがとうございます。始めるとき（または作らないと決めたとき）に一度だけご連絡します。",
    cancelHint: "取り消したくなったときのために、このリンクを保存しておいてください：",
    closed: "この募集は終了しました。ご関心をお寄せいただき、ありがとうございました。",
    duplicate: "このメールアドレスはすでに登録されています。",
    invalid: "メールアドレスの形式が正しくないようです。",
    busy: "いま登録が混み合っています。少し時間をおいてもう一度お試しください。",
    failed: "うまく送れませんでした。もう一度お試しください。",
    cancelTitle: "登録の取り消し",
    cancelLead: "下のボタンを押すと、登録したメールアドレスを削除します。",
    cancelButton: "登録を取り消す",
    cancelled: "取り消しました。メールアドレスは削除しました。",
    cancelMissing: "この登録は見つかりませんでした（すでに取り消し済みかもしれません）。",
  },
  zh: {
    badge: "筹备中",
    notice: "这个服务现在还没有。为了决定要不要做，想先看看有多少人想用。现在登记不收任何费用。",
    price: "预计价格",
    audience: "适合谁",
    email: "邮箱",
    note: "你会在什么情况下用它？（选填）",
    submit: "做出来了告诉我",
    submitting: "提交中…",
    privacy: "邮箱只用来在这个服务开始时、或者决定不做时，联系你一次，不会用在别的地方。登记后页面上会给一个链接，随时可以取消。",
    operator: "运营",
    operatorFallback: "个人筹备中",
    thanks: "登记好了，谢谢。开始时（或者决定不做时）会联系你一次。",
    cancelHint: "想取消的话，保存好这个链接：",
    closed: "这次登记已经结束了，谢谢关注。",
    duplicate: "这个邮箱已经登记过了。",
    invalid: "邮箱格式好像不对。",
    busy: "现在登记的人有点多，过一会儿再试一次。",
    failed: "没提交上，再试一次。",
    cancelTitle: "取消登记",
    cancelLead: "点下面的按钮，会删掉你登记的邮箱。",
    cancelButton: "取消登记",
    cancelled: "已经取消，邮箱删掉了。",
    cancelMissing: "没找到这条登记（可能已经取消过了）。",
  },
} as const satisfies Record<DoorLang, Record<string, string>>;

export const DOOR_NOTE_MAX = 300;

/** 邮箱格式（只挡明显不对的）。 */
export function validEmail(raw: string): string | null {
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/** 给他自己看时把邮箱打个码（记成观察时用：观察里不放完整邮箱）。 */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}

export type FakeDoorStats = { id: string; views: number; signups: number; open: boolean };
