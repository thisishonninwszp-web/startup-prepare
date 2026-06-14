/** 爬虫内部统一条目。每个 source 把抓到的东西规整成这个形状。 */
export type RawSignal = {
  /** 来源标识：'hackernews' | 'reddit' | 'v2ex' | 'web' ... */
  source: string;
  /** 源内唯一 id（HN objectID / reddit name / v2ex topic id / url），用于去重。 */
  sourceId: string;
  /** 原始链接（可空）。 */
  url?: string;
  /** 标题（可空）。 */
  title?: string;
  /** 原始正文/摘要——审阅时给人看、提升时喂给 digestExternal。 */
  rawText: string;
  /** 触发这次抓取的关键词/主题（用途②③：监控与对账）。 */
  query?: string;
};

/** 一个抓取源：给定关键词，返回若干规整条目。新增源只写一个这样的函数。 */
export type SourceFetcher = (query: string) => Promise<RawSignal[]>;
