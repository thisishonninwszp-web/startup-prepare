import { describe, expect, it } from "vitest";
import { extractArticleText, parseFeed } from "./rss";

describe("parseFeed", () => {
  it("读 RSS 2.0：标题、链接、时间，CDATA 和实体都解开", () => {
    const xml = `<rss><channel><title>频道名不算条目</title>
      <item>
        <title><![CDATA[サイバー攻撃 なぜ日本が標的に]]></title>
        <link>https://news.yahoo.co.jp/pickup/6598211?source=rss</link>
        <pubDate>Fri, 09 Oct 2026 23:42:21 GMT</pubDate>
        <description>&lt;p&gt;A &amp; B&lt;/p&gt;</description>
      </item>
    </channel></rss>`;
    const [item, ...rest] = parseFeed(xml);
    expect(rest).toHaveLength(0);
    expect(item.title).toBe("サイバー攻撃 なぜ日本が標的に");
    expect(item.link).toBe("https://news.yahoo.co.jp/pickup/6598211?source=rss");
    expect(item.publishedAt?.toISOString()).toBe("2026-10-09T23:42:21.000Z");
    expect(item.summary).toBe("A & B");
  });

  it("读 Atom：链接取 href", () => {
    const xml = `<feed><entry>
      <title>Hello</title>
      <link rel="alternate" href="https://example.com/a?x=1&amp;y=2"/>
      <updated>2026-10-11T03:00:00Z</updated>
    </entry></feed>`;
    const [item] = parseFeed(xml);
    expect(item.link).toBe("https://example.com/a?x=1&y=2");
    expect(item.publishedAt?.toISOString()).toBe("2026-10-11T03:00:00.000Z");
  });

  it("没标题、没链接、时间读不出的情况", () => {
    const xml = `<rss>
      <item><title></title><link>https://a.com</link></item>
      <item><title>无链接</title></item>
      <item><title>时间坏了</title><link>https://b.com</link><pubDate>昨天</pubDate></item>
    </rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("时间坏了");
    expect(items[0].publishedAt).toBeNull();
  });
});

describe("extractArticleText", () => {
  it("跳过版权行、邮件杂志广告和碎片，实体解两层", () => {
    const html = `<p>シェア</p>
      <p>OpenAIのエンジニアが新しいパーソナルAI「Dots」について説明した。</p>
      <p>&amp;copy; エクサウィザーズ AI新聞</p>
      <p>ITmedia ビジネスオンライン編集部が制作する日刊メールマガジンです</p>`;
    expect(extractArticleText(html)).toBe("OpenAIのエンジニアが新しいパーソナルAI「Dots」について説明した。");
  });
});
