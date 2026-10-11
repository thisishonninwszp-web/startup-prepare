import type { BookPick } from "@/lib/ai";

/**
 * AI 荐的书要先核实：英文书查 Open Library，日文书查国立国会图书馆（NDL），都不用 key。
 * 两件事都要过：①是真书 ②不是小说。
 * 提示词里写了"不推荐小说"，模型照样会推《日本沉没》《沈まぬ太陽》—— 所以靠书目数据拦：
 * Open Library 看主题里有没有 fiction / novel，NDL 看日本十进分类（9 开头是文学）。
 * 查不到、或者看不出是不是小说，都丢掉 —— 宁可少推荐一本。
 */

export type VerifiedBook = BookPick & {
  /** 去哪儿买 / 查：Amazon.co.jp 的搜索页（不是直链，避免链到错的版本）。 */
  link: string;
  /** 在哪个书目库查到的。 */
  verifiedBy: "Open Library" | "国立国会図書館";
};

type Check = "nonfiction" | "fiction" | "none";

/** 日本十进分类：9xx 是文学（小说、诗歌、随笔）。 */
export function isLiteratureNdc(code: string): boolean {
  return /^9/.test(code.trim());
}

/** 书名比较前去掉标点、空格、大小写、副标题。 */
export function normalizeTitle(title: string): string {
  return title
    .split(/[:：]/)[0]
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
}

/** 主书名：去掉冒号后面的副标题。书目库按带副标题的全名常常搜不到。 */
export function mainTitle(title: string): string {
  return title.split(/[:：]/)[0].trim();
}

type OpenLibraryDoc = { title?: string; author_name?: string[]; subject?: string[] };

async function searchOpenLibrary(params: Record<string, string>): Promise<OpenLibraryDoc[]> {
  const query = new URLSearchParams({ ...params, limit: "5", fields: "title,author_name,subject" });
  const res = await fetch(`https://openlibrary.org/search.json?${query}`, {
    headers: { "User-Agent": "ideaos-news/1.0" },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return ((await res.json()) as { docs?: OpenLibraryDoc[] }).docs ?? [];
}

/**
 * 书名和作者必须同时对上：AI 会张冠李戴（把 Benjamin Roth 的书安到 Kindleberger 头上），
 * 只看书名的话，同名书太多，一定能"查到"。
 */
async function checkOpenLibrary(fullTitle: string, author: string): Promise<Check> {
  const title = mainTitle(fullTitle);
  const want = normalizeTitle(title);
  const authorLower = author.toLowerCase();
  const doc = (await searchOpenLibrary({ title, author })).find(
    (d) =>
      d.title &&
      normalizeTitle(d.title) === want &&
      (d.author_name ?? []).some((name) => name.toLowerCase().includes(authorLower))
  );
  if (!doc) return "none";
  return (doc.subject ?? []).some((s) => /fiction|novel/i.test(s)) ? "fiction" : "nonfiction";
}

async function checkNdl(fullTitle: string, author: string): Promise<Check> {
  // mediatype=books：只看图书，不看杂志文章（不然会查到"某某作者访谈"之类的）
  const params = new URLSearchParams({ title: mainTitle(fullTitle), creator: author, mediatype: "books", cnt: "5" });
  const res = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?${params}`, {
    headers: { "User-Agent": "ideaos-news/1.0" },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!res.ok) return "none";
  const xml = await res.text();
  const codes = Array.from(xml.matchAll(/<dc:subject xsi:type="dcndl:NDC\d*">([^<]+)</g), (m) => m[1]);
  if (codes.length === 0) return "none"; // 查不到、或没有分类号，看不出是不是小说
  return codes.every(isLiteratureNdc) ? "fiction" : "nonfiction";
}

/** 作者名只取姓（最后一个词 / 日文名前两个字），书目库对全名的写法很挑。 */
export function authorKey(author: string): string {
  const name = author.split(/[,，、&]| and /)[0].trim();
  if (/[぀-ヿ一-鿿]/.test(name)) return name.replace(/\s+/g, "").slice(0, 2);
  const parts = name.split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export async function verifyBooks(books: BookPick[]): Promise<VerifiedBook[]> {
  const checked = await Promise.all(
    books.map(async (book): Promise<VerifiedBook | null> => {
      const author = authorKey(book.author);
      const link = `https://www.amazon.co.jp/s?${new URLSearchParams({ k: `${book.originalTitle} ${book.author}` })}`;
      try {
        const ol = await checkOpenLibrary(book.originalTitle, author);
        if (ol === "nonfiction") return { ...book, link, verifiedBy: "Open Library" };
        if (ol === "fiction") return null;
        if ((await checkNdl(book.originalTitle, author)) === "nonfiction") {
          return { ...book, link, verifiedBy: "国立国会図書館" };
        }
      } catch (e) {
        // 书目库超时就当没核实上；但要留痕，不然代码 bug 也会被当成"没查到"吞掉
        console.error("book verification failed", book.originalTitle, e);
      }
      return null;
    })
  );
  return checked.filter((b): b is VerifiedBook => b !== null);
}
