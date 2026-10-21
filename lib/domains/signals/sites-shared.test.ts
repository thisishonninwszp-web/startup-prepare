import { describe, expect, it } from "vitest";
import { keepMatching, parseCampfire, parseGirlschannel, parsePrtimes, prtimesDate } from "./sites-shared";

describe("ガルちゃん", () => {
  it("reads topic, comment count and date", () => {
    const html = `<div>74件</div><ul class="topic-list">
      <li class="flc"><a href="/topics/6155394/">
        <img data-src="x.png"/>
        <div class="info nn"><p class="comment"><span class="icon-comment"></span><span>1,260コメント</span><span class="datetime">2026/07/02(木) 08:19</span></p></div>
        <p class="title">家事代行やベビーシッター怖くないですか？</p></a></li>
      <li class="flc"><a href="/topics/1/"><div><p class="comment"><span>3コメント</span><span class="datetime">2019/01/05(土) 01:00</span></p></div><p class="title">洗濯 &amp;\u0000 掃除</p></a></li>
    </ul>`;
    const out = parseGirlschannel(html);
    expect(out.total).toBe(74);
    expect(out.topics).toEqual([
      { url: "https://girlschannel.net/topics/6155394/", title: "家事代行やベビーシッター怖くないですか？", date: "2026-07-02", comments: 1260 },
      { url: "https://girlschannel.net/topics/1/", title: "洗濯 & 掃除", date: "2019-01-05", comments: 3 },
    ]);
  });
});

describe("CAMPFIRE", () => {
  const card = (id: string, title: string, amount: string, backers: string, rest: string) =>
    `<li class="card-wrapper"><a data_project_id="${id}" class="card" href="/projects/${id}/view?list=x" title="${title}"><div class="status">FUNDED</div>
     <div class="footer-item total"><small class="s">現在</small> ${amount}<span>円</span></div>
     <div class="footer-item rest"><small class="s">支援者</small> ${backers}<span>人</span></div>
     <div class="footer-item per"><small class="s">残り</small> <!--[1-->${rest}<!--]--></div></a></li>`;
  it("reads amount, backers and whether it is still open", () => {
    const html = `<h1>「家事代行」で検索した結果18件のプロジェクトが見つかりました</h1><ol>${card("1", "家事代行アプリ", "23,000", "4", "終了")}${card("2", "家事代行 &quot;新&quot;", "0", "0", "12日")}</ol>`;
    const out = parseCampfire(html);
    expect(out.total).toBe(18);
    expect(out.projects).toEqual([
      { url: "https://camp-fire.jp/projects/1/view", title: "家事代行アプリ", amount: 23000, backers: 4, open: false },
      { url: "https://camp-fire.jp/projects/2/view", title: '家事代行 "新"', amount: 0, backers: 0, open: true },
    ]);
  });
});

describe("PR TIMES", () => {
  it("reads title, date and company", () => {
    const html = `<span class="_total_eo60q_5">3511<!-- -->件</span>
      <article class="_article_13jbw_1"><a class="_link" href="/main/html/rd/p/000000015.000105769.html"><div><h3 class="_title_13jbw_46">家事代行の調査</h3><span><svg></svg><time>2026年10月2日 15時00分</time></span></div></a><span class="_companyName_13jbw_32"><a href="/c">株式会社ロビー</a></span></article>`;
    const out = parsePrtimes(html, "2026-10-21");
    expect(out.total).toBe(3511);
    expect(out.releases).toEqual([
      { url: "https://prtimes.jp/main/html/rd/p/000000015.000105769.html", title: "家事代行の調査", date: "2026-10-02", company: "株式会社ロビー" },
    ]);
  });
});

describe("PR TIMES dates", () => {
  it("reads absolute and relative times", () => {
    expect(prtimesDate("2026年1月5日 15時00分", "2026-10-21")).toBe("2026-01-05");
    expect(prtimesDate("1時間前", "2026-10-21")).toBe("2026-10-21");
    expect(prtimesDate("5分前", "2026-10-21")).toBe("2026-10-21");
    expect(prtimesDate("3日前", "2026-10-21")).toBe("2026-10-18");
    expect(prtimesDate("昨日", "2026-10-21")).toBeNull();
  });
});

describe("keepMatching", () => {
  it("dedupes and keeps titles with the topic", () => {
    const a = { url: "a", title: "家事代行の話" };
    const b = { url: "b", title: "カニ" };
    expect(keepMatching([[a, b], [a]], "家事代行")).toEqual([a]);
  });
});
