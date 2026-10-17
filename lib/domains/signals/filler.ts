import type { BriefItem } from "./brief";

/**
 * 去掉条目收尾的空话：只是给前面的事下结论、不带新事实的那一句（「这表明……」「，这意味着……」）。
 * 宁可漏删，也不删事实：句子里有具体的人和事、只是用了「趋势」「日益」的，不动。
 * 生成报告时删一遍，显示旧报告时再删一遍；删过的再跑一遍不会变。纯函数。
 */

/** 整句只是在评论上一句：「这/此 +（举、也、一…、些…、种…）+ 表明/意味着/反映/体现/凸显/标志着/预示/说明」开头。 */
const COMMENT_SENTENCE =
  /^(?:这|此)(?:举|也|一[^，,。！？]{0,6}?|些[^，,。！？]{0,6}?|种[^，,。！？]{0,6}?)?也?(?:表明|意味着|反映|体现|凸显|标志着|预示|说明)/;

/** 句尾那半句：「，这意味着……」「，并凸显了……」。「并 / 也」后面只认下结论的动词（「并表明将……」常常是事实）。 */
const COMMENT_CLAUSE =
  /[，,]\s*(?:(?:这|此举|这也|从而|进而)也?(?:表明|意味着|反映出|反映了|体现出|体现了|凸显了|凸显出|标志着|预示着|预示了)|(?:并|也)(?:反映出|反映了|体现出|体现了|凸显了|凸显出|标志着|预示着|预示了))[^。！？]*/;

export function isCommentSentence(sentence: string): boolean {
  return COMMENT_SENTENCE.test(sentence.trim());
}

/** AI、API 这类通用的英文词不算专有名词。 */
const GENERIC_LATIN = new Set(["ai", "api", "gpu", "cpu", "it", "dx", "o2o", "sns", "ec", "app", "pc", "ip"]);

/**
 * 删之前再看一眼：带数字的、带专有名词（英文名）的、写着"首次"的、在说"可以拿它做什么"的，不删。
 * 真跑两周的报告时碰到过「，这标志着它首次与LG电子和施耐德电气深度合作」「这意味着开发者可以……」。
 */
function carriesFact(text: string): boolean {
  // 先拿掉 AI、O2O 这类通用词（O2O 里的 2 不算数字）
  const plain = text.normalize("NFKC").replace(/[A-Za-z][A-Za-z0-9.+-]*/g, (w) => (GENERIC_LATIN.has(w.toLowerCase()) ? "" : w));
  if (/[0-9]/.test(plain) || /[A-Za-z]/.test(plain)) return true;
  if (/首次|第一次|首家|首个/.test(plain)) return true;
  // 「可能」「未能」「不能」「功能」「性能」里的「能」不算
  return /意味着[^，。！？]{0,12}?(?:可以|能够|(?<![可功性未不])能(?![力源])|无需|不必|不用|即可)/.test(plain);
}

/** 删掉的整句或半句放在 dropped 里。一句都没删就原样返回；全删光也原样返回（交给上游决定要不要重写）。 */
export function dropEmptyConclusions(text: string): { text: string; dropped: string[] } {
  const sentences = text.match(/[^。！？]+[。！？]?/g) ?? [];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (isCommentSentence(s) && !carriesFact(s)) {
      dropped.push(s);
      continue;
    }
    const m = COMMENT_CLAUSE.exec(s);
    if (m && m.index > 0 && !carriesFact(m[0])) {
      const end = /[。！？]$/.test(s) ? s.slice(-1) : "";
      dropped.push(s.slice(m.index + 1, end ? -1 : undefined).trim());
      kept.push(s.slice(0, m.index) + end);
      continue;
    }
    kept.push(s);
  }
  if (dropped.length === 0 || kept.length === 0) return { text, dropped: [] };
  return { text: kept.join(""), dropped };
}

/** 一条报告条目：背景、「主要影响谁」那一句、先例都删一遍，删掉的接在 dropped 后面。「也值得一看」那几条没有背景，不动。 */
export function cleanBriefItem(item: BriefItem): BriefItem {
  if (item.extra) return item;
  const background = dropEmptyConclusions(item.background);
  const forYou = dropEmptyConclusions(item.for_you);
  const precedent = item.precedent ? dropEmptyConclusions(item.precedent) : null;
  const dropped = [...(item.dropped ?? []), ...background.dropped, ...forYou.dropped, ...(precedent?.dropped ?? [])];
  return {
    ...item,
    background: background.text,
    for_you: forYou.text,
    ...(precedent ? { precedent: precedent.text } : {}),
    ...(dropped.length > 0 ? { dropped } : {}),
  };
}
