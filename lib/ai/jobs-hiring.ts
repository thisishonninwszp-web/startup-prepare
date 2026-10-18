import { executeAiJson } from "@/lib/ai-gateway";
import { MODEL } from "./shared";
import { parseHiring, MAX_HIRING_FACTS, MAX_HIRING_NEEDS, type HiringFact, type HiringNeed } from "@/lib/domains/jobs/hiring-shared";

// ---------------------------------------------------------------------------
// 「这家为什么现在招」：读招聘页和查到的公开资料，推测这家现在缺什么样的人。
// 原话由代码核对（hiring-shared.ts）；推测必须引查到的事，标明是推测，不下结论。
// ---------------------------------------------------------------------------

const HIRING_PROMPT = `他在日本找工作，要投下面这个岗位。招聘页是人事照着现场的需求写的，你要帮他猜"这家现在为什么招这个人、现场真正缺什么"。

给你：招聘页（编号 S0）和上网查到的几篇资料（S1、S2……，可能有和这家无关的，无关的别用）。

先写 facts：从资料里挑出能说明"这家现在在做什么、往哪里走"的事，最多 ${MAX_HIRING_FACTS} 条：
- key：F1、F2……
- source：出自哪一篇（S0、S1……）
- quote：那一篇里的原话，逐字照抄，10 到 120 字，不翻译、不改字
- point：一句中文，说这条说明了什么（只说原话里写着的，不推）
重点找：中期计划、新事业、组织新设或调整、扩招或培养计划、新服务、招聘页上写的「募集背景」「配属部署」「ポテンシャル採用」之类。宣传口号、福利待遇不算。

再写 needs：推测"这个岗位"现在为什么招、现场缺什么样的人，${MAX_HIRING_NEEDS} 条以内。
要把"公司在做的事"和"这个岗位要干的活"连起来，不要只复述公司的大方向（"需要懂 AI 的人"这种换哪家都成立的不要写）。每条：
- need：一句中文推测，60 字以内（"可能在……，所以这个岗位要……的人"）。这是推测，可以用"可能"。正文里不要写编号。
- facts：依据是哪几件事（F1……），至少一件。
- posting_quote：招聘页（S0）上和这条对得上的原话，逐字照抄，必填 —— 招聘页上找不到对得上的话，说明这条跟这个岗位没关系，不要写这条。
- show：书类里怎么体现，一两句中文：哪类经历放前面、强调什么。只说调整顺序和重点，不许让他写没做过的事，
  也不许建议在书类里替对方诊断问题（"御社の課題は○○"这种不写）。正文里不要写编号。
- ask：面试或面谈时用来验证这条推测的一句日文问题，只问一件事，80 字以内，礼貌、具体。
  提到公开事实时说「〜を拝見しました」；他没听谁说过，不许写「伺いました」「と聞きました」；不写编号（S1、F2）。

need 和 show 用中文写（他读中文），ask 用日文写（拿去问对方）。

规矩：
- 只用给你的材料。数字只许用原话里有的。不许夸他，也不许夸这家公司。
- 宁可少写，也不要凭空猜；材料撑不起的推测不写。

只输出 JSON：{"facts":[{"key":"F1","source":"S1","quote":"…","point":"…"}],"needs":[{"need":"…","facts":["F1"],"posting_quote":"","show":"…","ask":"…"}]}`;

export type HiringSourceInput = { key: string; title: string; url: string | null; text: string };

export async function inferHiringNeeds(
  userId: string,
  posting: { company: string; title: string; body: string },
  sources: HiringSourceInput[]
): Promise<{ facts: HiringFact[]; needs: HiringNeed[] }> {
  const sourceText = new Map(sources.map((s) => [s.key, `${s.title}\n${s.text}`]));
  const contents = [
    `岗位：${posting.company}｜${posting.title}`,
    ...sources.map((s) => `【${s.key}】${s.title}${s.url ? `（${s.url}）` : ""}\n${s.text}`),
  ].join("\n\n");
  return executeAiJson(
    { userId, operation: "job_hiring", module: "jobs", outputMode: "json", timeoutMs: 40_000 },
    (attempt) => ({
      model: MODEL,
      contents:
        contents +
        (attempt === 1
          ? "\n\n上一次输出没通过校验：quote 必须是那一篇里逐字照抄的原话；每条 need 至少引一件留下来的事、posting_quote 必须是招聘页上逐字照抄的原话；need 和 show 用中文写；数字只能用原话里有的。"
          : ""),
      config: {
        systemInstruction: HIRING_PROMPT,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 3000,
      },
    }),
    (value) => parseHiring(value, sourceText, posting.body)
  );
}
