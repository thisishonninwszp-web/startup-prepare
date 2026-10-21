/**
 * 外部接口的 Key 配好了没有：只看有没有值，不显示值（页面上只出现「配了 / 没配」和变量名）。
 * 一样东西可以认几个名字的（楽天早先材料抓取用的 RAKUTEN_APP_ID），哪个有值就显示用的是哪个。
 */

export type EnvItem = {
  label: string;
  /** 拿它干什么（一句）。 */
  use: string;
  /** 每一格要的变量名；一格里有几个名字，任一个有值就算配了。 */
  slots: string[][];
  /** 免费怎么拿。 */
  how: string;
};

export const ENV_ITEMS: EnvItem[] = [
  {
    label: "楽天市场",
    use: "「听一听」里有多少人在买：相关商品几件、评价最多的几件",
    slots: [["RAKUTEN_APPLICATION_ID", "RAKUTEN_APP_ID"], ["RAKUTEN_ACCESS_KEY"]],
    how: "webservice.rakuten.co.jp 注册应用，Allowed websites 填 startup-prepare.vercel.app",
  },
  {
    label: "e-Stat",
    use: "家计调查每户每月花多少、慢变量的月度数据",
    slots: [["ESTAT_APP_ID"]],
    how: "e-stat.go.jp 注册后在「マイページ → API 機能」发一个",
  },
  {
    label: "YouTube",
    use: "「听一听」里这个叫法的视频有几条、播放多少",
    slots: [["YOUTUBE_API_KEY"]],
    how: "Google Cloud 控制台开 YouTube Data API v3，免费额度一天 1 万单位",
  },
  {
    label: "Reddit",
    use: "「听一听」里在日外国人在 Reddit 上问这件事的帖子，每年几条",
    slots: [["REDDIT_CLIENT_ID"], ["REDDIT_CLIENT_SECRET"]],
    how: "reddit.com/prefs/apps 建一个 script 类应用拿 client id 和 secret；2025-11 起新应用还要另外向 Reddit 申请、人工审批（不一定批，等多久也没准）",
  },
  {
    label: "Tavily",
    use: "Google 搜不到或出错时的备用搜索",
    slots: [["TAVILY_API_KEY"]],
    how: "tavily.com 免费层一个月 1000 次",
  },
  {
    label: "Jev 裁判",
    use: "判原话算不算、往下推每一步的档位、时差图谱的原文证明了什么",
    slots: [["JEV_API_KEY"]],
    how: "TypeSafe 的控制台",
  },
  {
    label: "提醒邮件",
    use: "每天早上报告好了发一封",
    slots: [["GMAIL_USER"], ["GMAIL_APP_PASSWORD"]],
    how: "Google 账号 → 安全性 → 应用专用密码",
  },
];

export type EnvStatus = { label: string; use: string; how: string; ok: boolean; slots: { names: string[]; using: string | null }[] };

/** 只返回有没有、用的是哪个名字，不带值。 */
export function envStatus(env: Record<string, string | undefined>, items: EnvItem[] = ENV_ITEMS): EnvStatus[] {
  return items.map((item) => {
    const slots = item.slots.map((names) => ({ names, using: names.find((n) => (env[n] ?? "").trim() !== "") ?? null }));
    return { label: item.label, use: item.use, how: item.how, ok: slots.every((s) => s.using !== null), slots };
  });
}
