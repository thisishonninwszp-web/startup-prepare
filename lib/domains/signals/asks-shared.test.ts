import { describe, expect, it } from "vitest";
import {
  asksByYear,
  collectAsks,
  mergeAsked,
  parseChiebukuroPage,
  parseKokkaiCount,
  parseRedditListing,
  parseYoutubeYear,
  questionUrl,
  readTotals,
  titleHasTopic,
} from "./asks-shared";

const page = (id: string, name: string, extra = "") => `<html><head>
<script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@context":"https://schema.org","@type":"QAPage","mainEntity":{"@type":"Question","name":${JSON.stringify(name)},"datePublished":"2021-03-28T11:00:03.000Z","answerCount":3}}]</script>
</head><body><script>window.x={"viewNumber":"7,697","reactionCounter":{"count":12,"actionType":"sympathy"},
"stream":{"list":{"items":[
{"type":"LIST_ITEM","content":{"category":"掃除","questionTitle":"家事代行の\\"内容\\"\\nについて","answerCount":4,"dateString":"2024/9/3 12:13","chieCoin":25,"href":"https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q100","ylk":"a"}},
{"type":"INFD"},
{"type":"LIST_ITEM","content":{"category":"家事","questionTitle":"洗濯機の選び方","answerCount":1,"dateString":"2019/12/25 08:00","chieCoin":0,"href":"https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q200","ylk":"b"}},
{"type":"LIST_ITEM","content":{"category":"家事","questionTitle":"自分自身","answerCount":1,"dateString":"2019/12/25 08:00","chieCoin":0,"href":"https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/${id}","ylk":"c"}}
${extra}]}}}</script></body></html>`;

describe("知恵袋 page", () => {
  it("reads the question, its views and 共感, and the related list", () => {
    const { main, related } = parseChiebukuroPage(page("q1", "家事代行サービスについて\n感想を教えて"), "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1?fr=x");
    expect(main).toEqual({
      url: "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1",
      title: "家事代行サービスについて 感想を教えて",
      date: "2021-03-28",
      answers: 3,
      views: 7697,
      sympathy: 12,
    });
    // 自己那条不算进相关；转义还原
    expect(related.map((r) => r.url.slice(-4))).toEqual(["q100", "q200"]);
    expect(related[0]).toMatchObject({ title: '家事代行の"内容" について', date: "2024-09-03", answers: 4 });
    expect(related[1].date).toBe("2019-12-25");
  });

  it("returns no main entry when the page has no QAPage", () => {
    expect(parseChiebukuroPage("<html></html>", "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1").main).toBeNull();
  });

  it("normalises question addresses and rejects others", () => {
    expect(questionUrl("https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q123?fr=a#b")).toBe(
      "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q123"
    );
    expect(questionUrl("https://chiebukuro.yahoo.co.jp/search?p=x")).toBeNull();
  });
});

describe("collecting asks", () => {
  it("needs every word of the topic in the title", () => {
    expect(titleHasTopic("家事代行を中国語で頼みたい", "家事代行 中国語")).toBe(true);
    expect(titleHasTopic("家事代行を頼みたい", "家事代行 中国語")).toBe(false);
  });

  it("keeps matching titles, prefers the read page, newest first", () => {
    const a = parseChiebukuroPage(page("q1", "家事代行の料金"), "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1");
    const b = parseChiebukuroPage(page("q100", "家事代行の\"内容\"について"), "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q100");
    const asks = collectAsks([a, b], "家事代行");
    expect(asks.map((x) => x.url.split("/").pop()).sort()).toEqual(["q1", "q100"]);
    expect(asks.find((x) => x.url.endsWith("q100"))?.views).toBe(7697);
    expect(asks.some((x) => x.url.endsWith("q200"))).toBe(false);
    expect(asks[0].date >= asks[asks.length - 1].date).toBe(true);
  });

  it("counts per year with empty years filled", () => {
    expect(asksByYear([{ date: "2022-01-01" }, { date: "2024-05-01" }, { date: "2024-06-01" }], 2025)).toEqual([
      { year: 2022, count: 1 },
      { year: 2023, count: 0 },
      { year: 2024, count: 2 },
      { year: 2025, count: 0 },
    ]);
    expect(asksByYear([], 2025)).toEqual([]);
  });

  it("totals only the pages that were read", () => {
    expect(readTotals([{ url: "a", title: "", date: "", answers: 0, views: 10, sympathy: 2 }, { url: "b", title: "", date: "", answers: 1 }])).toEqual({
      pages: 1,
      views: 10,
      sympathy: 2,
    });
  });
});

describe("suggest rounds and kokkai", () => {
  it("merges rounds, skipping ones already shown", () => {
    expect(mergeAsked([["料金", "高い"], null, ["高い", "危ない"]], ["料金"])).toEqual(["高い", "危ない"]);
    expect(mergeAsked([null, null])).toBeNull();
  });

  it("reads numberOfRecords", () => {
    expect(parseKokkaiCount({ numberOfRecords: 10 })).toBe(10);
    expect(parseKokkaiCount({ numberOfRecords: "3" })).toBe(3);
    expect(parseKokkaiCount({ message: "error" })).toBeNull();
  });
});

describe("youtube per year", () => {
  it("counts titles with the topic and marks a full page", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ snippet: { title: i < 3 ? `家事代行&amp;掃除 ${i}` : "関係ない" } }));
    expect(parseYoutubeYear({ items, nextPageToken: "x" }, "家事代行")).toEqual({ count: 3, capped: true });
    expect(parseYoutubeYear({ items: items.slice(0, 10) }, "家事代行")).toEqual({ count: 3, capped: false });
    expect(parseYoutubeYear({ error: {} }, "家事代行")).toBeNull();
  });
});

describe("reddit listing", () => {
  it("keeps posts mentioning every word, with date and comments", () => {
    const json = {
      data: {
        after: "t3_next",
        children: [
          { data: { title: "Housekeeping service in Tokyo?", selftext: "", created_utc: 1700000000, permalink: "/r/japanlife/comments/a/x/", num_comments: 12, subreddit: "japanlife" } },
          { data: { title: "Cleaning", selftext: "anyone used a housekeeping SERVICE?", created_utc: 1600000000, permalink: "/r/tokyo/comments/b/y/", num_comments: 3, subreddit: "tokyo" } },
          { data: { title: "Visa question", selftext: "housekeeping only", created_utc: 1600000000, permalink: "/r/japan/comments/c/z/", subreddit: "japan" } },
          { data: { title: "", selftext: "housekeeping service", created_utc: 1600000000, permalink: "/r/japan/comments/d/w/" } },
        ],
      },
    };
    const out = parseRedditListing(json, "housekeeping service");
    expect(out.seen).toBe(4);
    expect(out.after).toBe("t3_next");
    expect(out.posts.map((p) => p.url)).toEqual([
      "https://www.reddit.com/r/japanlife/comments/a/x/",
      "https://www.reddit.com/r/tokyo/comments/b/y/",
    ]);
    expect(out.posts[0]).toMatchObject({ date: "2023-11-14", comments: 12, sub: "japanlife" });
  });

  it("handles an empty or broken listing", () => {
    expect(parseRedditListing(null, "x")).toEqual({ posts: [], seen: 0, after: null });
  });
});
