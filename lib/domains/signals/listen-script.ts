/**
 * 「听今天的报告」念什么 —— 「今天」页的听按钮和邮件里「听」的那一页用同一份。不碰数据库。
 * 先念 AI 今日总览（他静音了某些事时不念，免得混进去），再念每一节的总述和每条的标题、背景；
 * AI 写的部分念之前说明是 AI 整理；练习题那一条还没判断时不念背景，免得剧透。
 */

export type ListenSection = {
  title: string;
  /** 这一节的总述；这一节有被他静音的条目时传 null（总述里可能提到）。 */
  overview: string | null;
  /** 要念的条目（已经去掉静音的、「也值得一看」的）。 */
  items: { signal_id: string; headline: string; background: string }[];
};

export function buildListenScript(input: { digest: string | null; sections: ListenSection[]; hiddenSignalId: string | null }): string[] {
  return [
    ...(input.digest ? ["AI 今日总览", input.digest] : []),
    ...input.sections.flatMap((s) =>
      s.items.length === 0
        ? []
        : [
            s.title,
            ...(s.overview ? ["以下是 AI 整理与推断。", s.overview] : []),
            ...s.items.map((i) =>
              i.signal_id === input.hiddenSignalId ? `${i.headline}。这条是今天的练习题，先自己判断。` : `${i.headline}。以下是 AI 整理，解释仍需核验。${i.background}`
            ),
          ]
    ),
  ];
}

/** 念完大约几分钟（中文朗读一分钟三百字上下）。 */
export function listenMinutes(paragraphs: string[]): number {
  return Math.max(1, Math.round(paragraphs.join("").length / 300));
}
