export type JournalRedaction = {
  text: string;
  redactions: string[];
};

export function redactJournal(
  input: string,
  privateTerms: string[]
): JournalRedaction {
  let text = input;
  const redactions = new Set<string>();
  text = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    () => {
      redactions.add("邮箱");
      return "[已遮蔽邮箱]";
    }
  );
  text = text.replace(
    /(?<!\d)(?:\+?\d{1,3}[-\s]?)?(?:0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{4}|1[3-9]\d{9})(?!\d)/g,
    () => {
      redactions.add("电话");
      return "[已遮蔽电话]";
    }
  );
  for (const rawTerm of privateTerms) {
    const term = rawTerm.trim();
    if (!term) continue;
    if (text.includes(term)) {
      text = text.split(term).join("[已遮蔽自定义词]");
      redactions.add("自定义词");
    }
  }
  return { text, redactions: Array.from(redactions) };
}
