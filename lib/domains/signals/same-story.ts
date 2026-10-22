/**
 * 两条新闻算不算「同一件事」（这件事以前、后来；你在跟的事有新消息）。
 *
 * 只看意思的相似度不够（2026-10-22 拿线上 32 条、320 对近邻校准过）：
 * - 同一件事的不同报道多在 0.88 以上（PHP 漏洞各家的报道 0.87–0.95，德国 13 岁以下禁 SNS 0.89–0.97）；
 * - 但同一个作者、同一种文体的不同文章也能到 0.90–0.95（note 上同一个人的几篇营销随笔），
 *   英文科技新闻随便两条也常在 0.80–0.84。
 * 所以要两样都满足：相似度够高，并且标题里有同一个「凭据词」——专有名词一类的（PHP、ドイツ、建築士法、Kinish），
 * 不算 AI、資金調達、ラウンド、政府 这种到处都有的词。两档：
 * - 0.88 以上：有一个共同的拉丁字母或片假名的词，或者两组相邻的汉字；
 * - 0.84 以上：两边标题里有同一个大写开头的拉丁字母词（PHP、GM、Kinish —— 专有名词；unicorn、valuation 这种小写的普通词不算）。
 * 校准那批里留下的 27 对都是同一件事（或同一家公司）。宁可漏掉几条，不把不相干的说成同一件事。
 */

/** 相似度门槛（余弦）：有共同凭据词时。 */
export const SAME_STORY_MIN = 0.88;
/** 两边标题有同一个专有名词时，放宽到这里。也是去数据库里取候选的下限。 */
export const SAME_STORY_FLOOR = 0.84;

const LATIN_STOP = new Set(
  (
    "ai ml llm the and for with new its now how why what who whom says said say about from into after over more most first will can could " +
    "are was were has have had this that these those your you our not but all out off via inc ltd corp llc news update updates launch launches " +
    "launched raises raise raised series round startup startups company companies market markets report reports data app apps model models tool tools " +
    "agent agents open source online pr times yahoo nhk ceo cto m&a ipo eu us uk usa japan japanese china chinese tech web ev it hr vc os tv " +
    "ask show hn just like get gets got make makes one two three year years day days week weeks month months billion million percent per " +
    // 媒体名：同一家媒体的标题里常带着，不说明是同一件事
    "ann jnn fnn nnn tbs afp ap reuters bloomberg nikkei itmedia gigazine techcrunch verge wired cnbc cnn bbc abema tver livedoor infoseek " +
    "ascii impress zdnet publickey piyolog note qiita zenn hatena newspicks forbes"
  ).split(" ")
);

const KATAKANA_STOP = new Set(
  (
    "ニュース サービス システム ラウンド シリーズ スタートアップ セミナー プレスリリース オンライン データ ビジネス テクノロジー マーケティング " +
    "プラットフォーム ソリューション サポート プロジェクト グループ ホールディングス アプリ ユーザー コンテンツ イベント セキュリティ デジタル " +
    "ソフトウェア インターネット メーカー モデル ツール エージェント クラウド ファンド コンサル チーム ノウハウ リスク コスト メディア"
  ).split(" ")
);

const HAN_STOP = new Set(
  (
    "日本 中国 米国 美国 政府 企業 企业 会社 公司 発表 发布 開始 开始 実施 资金 資金 金調 调达 調達 年度 今年 去年 市場 市场 経済 经济 世界 全国 全球 " +
    "予定 方針 検討 導入 提供 事業 株式 式会 問題 对应 対応 支援 公開 発見 調査 開発 开发 技術 技术 情報 時代 社会 地域 業界 行业 関連 拡大 最新 " +
    "必要 理由 方法 結果 影響 可能 背景 課題 戦略 経営 社員 成功 増加 減少 首相 大臣 政権 自民 中小 小企 推出 宣布 用户 平台 产品 国内"
  ).split(" ")
);

/** 标题后面常挂着的媒体名（「 - 日本経済新聞」「（共同通信）」「| 株式会社X」）和前面的栏目标签（「[ITmedia News]」「【保存版】」）去掉，免得同一家媒体的标题彼此「有共同的词」。 */
export function stripPublisher(title: string): string {
  return title
    .replace(/^\s*(\[[^\]]{1,30}\]|【[^】]{1,30}】)\s*/, "")
    .replace(/\s+[-|｜–—]\s+[^-|｜–—]{1,40}$/, "")
    .replace(/[（(][^（）()]{1,20}[）)]\s*$/, "")
    .trim();
}

/**
 * 标题里能当凭据的词：拉丁字母的词（3 个字母以上，或全大写的缩写如 GM、PHP）、片假名词（3 个以上）、汉字串里相邻两个字。
 * proper 是其中大写开头的拉丁字母词（专有名词）。
 */
export function anchorTokens(title: string): { words: Set<string>; proper: Set<string>; han: Set<string> } {
  const t = stripPublisher(title);
  const words = new Set<string>();
  const proper = new Set<string>();
  for (const m of Array.from(t.matchAll(/[A-Za-z][A-Za-z0-9&+.'’-]*[A-Za-z0-9]|[A-Za-z]{2,}/g))) {
    const raw = m[0].replace(/['’]s$/, "").replace(/\.$/, "");
    const w = raw.toLowerCase();
    if (LATIN_STOP.has(w)) continue;
    if (w.length >= 3 || (raw.length === 2 && raw === raw.toUpperCase())) {
      words.add(w);
      if (/[A-Z]/.test(raw)) proper.add(w);
    }
  }
  for (const m of Array.from(t.matchAll(/[ァ-ヺー]{3,}/g))) if (!KATAKANA_STOP.has(m[0])) words.add(m[0]);
  const han = new Set<string>();
  for (const m of Array.from(t.matchAll(/[一-鿿々]{2,}/g))) {
    for (let i = 0; i + 1 < m[0].length; i++) {
      const bigram = m[0].slice(i, i + 2);
      if (!HAN_STOP.has(bigram)) han.add(bigram);
    }
  }
  return { words, proper, han };
}

/** 算不算同一件事：见文件开头的两档。 */
export function isSameStory(a: string | null, b: string | null, similarity: number): boolean {
  if (similarity < SAME_STORY_FLOOR || !a || !b) return false;
  const x = anchorTokens(a);
  const y = anchorTokens(b);
  if (Array.from(x.proper).some((w) => y.proper.has(w))) return true;
  if (similarity < SAME_STORY_MIN) return false;
  if (Array.from(x.words).some((w) => y.words.has(w))) return true;
  return Array.from(x.han).filter((h) => y.han.has(h)).length >= 2;
}
