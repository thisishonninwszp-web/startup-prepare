import { describe, expect, it } from "vitest";
import { anchorTokens, isSameStory, stripPublisher } from "./same-story";

// 下面的标题和相似度都是 2026-10-22 线上存档里的真实近邻（校准时用的那批）
describe("算不算同一件事", () => {
  it("同一件事的不同报道：留", () => {
    expect(isSameStory("ドイツ 13歳未満のSNS禁止へ 2027年以降に施行予定 子ども向けサービスは例外", "ドイツ、13歳未満SNS禁止へ メルツ政権が閣議決定 - 日本経済新聞", 0.886)).toBe(true);
    expect(isSameStory("国土交通省、2027年4月に改正建築士法施行=全ての設計受託契約で書面契約義務化 - 住宅産業新聞", "改正建築士法の施行政令が閣議決定 27年4月施行へ - 新建ハウジング", 0.886)).toBe(true);
    expect(isSameStory("自民 衆院定数の削減幅を31で調整", "定数削減 自民幹事長の腹案に波紋", 0.891)).toBe(true);
    expect(isSameStory("「Privaco」運営のサニーズ、シードラウンドで5,000万円を資金調達 - PR TIMES", "国産パスワード管理・アクセス管理サービス「Privaco」を提供するサニーズ株式会社がシードラウンドで資金調達", 0.927)).toBe(true);
  });

  it("相似度低一些、但有同一个专有名词：留", () => {
    expect(isSameStory("「PHP」の“致命的”な脆弱性2件が修正、ただちにアップデートを", "PHP 8.5.12 released with security fixes | The Dev Dispatch", 0.871)).toBe(true);
    expect(isSameStory("PHPの重大欠陥で深夜の修正作業", "PHP armageddon: OpenAI, Google’s Wiz find ancient holes, panicking the internet", 0.851)).toBe(true);
  });

  it("文体、作者一样的不同文章：相似度再高也不留", () => {
    expect(isSameStory("お客さんが増えない理由は「チャネル」が少ないからかもしれない。", "「読まれた」で終わらせない。アクセスを収益につなげるWEBマーケティングの基本。", 0.949)).toBe(false);
    expect(isSameStory("売れる人ほどいきなり売らない。「テストクロージング」の基本。", "「読まれた」で終わらせない。アクセスを収益につなげるWEBマーケティングの基本。", 0.935)).toBe(false);
  });

  it("同一类的不同事：普通词、到处都有的词、媒体名不算凭据", () => {
    // 都是「估值到了独角兽」，但不是同一家公司（unicorn、valuation 是普通词）
    expect(isSameStory("Blacksmith hits unicorn valuation after Sequoia leads Series C", "AI assistant startup Town nabs unicorn valuation 4 months after launch", 0.869)).toBe(false);
    // 都是融资新闻（資金調達、ラウンド 到处都有）
    expect(isSameStory("「Privaco」運営のサニーズ、シードラウンドで5,000万円を資金調達 - PR TIMES", "Facilo、シリーズBラウンドで総額64億円の資金調達を実施 | 株式会社Faciloのプレスリリース", 0.853)).toBe(false);
    // 同一个部委的不同政策
    expect(isSameStory("国土交通省、2027年4月に改正建築士法施行=全ての設計受託契約で書面契約義務化 - 住宅産業新聞", "国土交通省住宅局、「上位住宅トップランナー制度」設立=2027年4月運用開始、大手・準大手対象", 0.869)).toBe(false);
    // 同一家媒体（ANN）的两条
    expect(isSameStory("ドイツ 13歳未満のSNS禁止へ (ANN)", "副業サポート詐欺 37歳男ら逮捕 (ANN)", 0.85)).toBe(false);
  });

  it("相似度不够的一律不留", () => {
    expect(isSameStory("PHP 8.2.35", "PHPに重大欠陥", 0.83)).toBe(false);
  });
});

describe("凭据词", () => {
  it("去掉媒体名和栏目标签", () => {
    expect(stripPublisher("[ITmedia News] PHPの脆弱性、修正版公開 - ITmedia")).toBe("PHPの脆弱性、修正版公開");
    expect(stripPublisher("プログラム言語PHPに重大欠陥（共同通信）")).toBe("プログラム言語PHPに重大欠陥");
  });

  it("专有名词、片假名词、相邻汉字；常见的不算", () => {
    const t = anchorTokens("Eka Robotics、AIスタートアップがシリーズAで資金調達、カスハラ対策");
    expect(Array.from(t.proper).sort()).toEqual(["eka", "robotics"]);
    expect(t.words.has("ai")).toBe(false);
    expect(t.words.has("スタートアップ")).toBe(false);
    expect(t.words.has("カスハラ")).toBe(true);
    expect(t.han.has("資金")).toBe(false);
    expect(t.han.has("対策")).toBe(true);
  });
});
