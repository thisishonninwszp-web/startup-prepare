import { executeJev, type JevQuestion, type JevResult } from "../ai-gateway";
import {
  PORTRAIT_AXES,
  PORTRAIT_LEVELS,
  renderWritings,
  type PortraitAnswers,
  type PortraitAxisKey,
  type PortraitAxisResult,
  type Writing,
} from "@/lib/domains/self-model/portrait";

/**
 * 每个维度问 Jev 两件事：
 * 一是这批文字里有没有讲到它（没讲到，档位就是瞎猜）；
 * 二是落在哪一档。档位从「低」到「高」，两头都不是好坏，只是方向。
 */
const AXIS_QUESTIONS: Record<
  PortraitAxisKey,
  { evidence: string; instructions: string; criteria: string[] }
> = {
  attribution: {
    evidence:
      "这些文字里，有没有讲到某件事没做成、不顺利、出了问题，并且说了原因？",
    instructions:
      "这个人讲到事情没做成时，把原因归到哪里？只看他写出来的原因，不要替他补。",
    criteria: [
      "几乎都归给外部：别人、时间不够、运气、环境",
      "多数归给外部，偶尔提到自己",
      "外部和自己的决定差不多各一半",
      "多数落到自己当时的决定或做法上，偶尔提外部",
      "几乎都落到自己当时的决定或做法上",
    ],
  },
  commitment: {
    evidence: "这些文字里，有没有写到打算要做的事、计划或承诺？",
    instructions:
      "这个人写下的打算和承诺有多具体？看有没有写清楚做什么、对谁、什么时候、做到多少。",
    criteria: [
      "几乎都是「争取」「多做」「尽量」这种，没有对象、时间和数量",
      "多数含糊，偶尔有一条写清了时间或数量",
      "含糊的和具体的差不多各一半",
      "多数写清了做什么和什么时候，偶尔含糊",
      "几乎每条都写清了做什么、对谁、哪天、多少",
    ],
  },
  doing: {
    evidence: "这些文字里，有没有讲到这个人自己的事情（做了的或者想做的）？",
    instructions:
      "这个人写下的内容里，已经做了的事和结果，与打算、想法、分析相比，哪种多？",
    criteria: [
      "几乎都是想法、分析、打算，很少写已经做了什么",
      "想法多，做了的事少",
      "两种差不多",
      "做了的事和结果多，想法少",
      "几乎都是已经做了的事和它的结果",
    ],
  },
  risk: {
    evidence: "这些文字里，有没有讲到面对拿不准、有风险的事时怎么想或怎么做？",
    instructions:
      "这个人面对拿不准的事时，写出来的倾向是先等条件成熟、想清楚再动，还是先小步试一下？",
    criteria: [
      "几乎总是先等：要想清楚、准备好、条件成熟再动",
      "多数时候先等，偶尔先试",
      "等和试差不多",
      "多数时候先小步试，偶尔先等",
      "几乎总是先试一下再说，边做边看",
    ],
  },
};

export function buildPortraitQuestions(): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const axis of PORTRAIT_AXES) {
    const spec = AXIS_QUESTIONS[axis.key];
    questions[`${axis.key}_evidence`] = {
      type: "noul",
      instructions: spec.evidence,
    };
    questions[axis.key] = {
      type: "score",
      instructions: spec.instructions,
      criteria: spec.criteria,
    };
  }
  return questions;
}

function probability(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} 不是 0 到 1 之间的数`);
  }
  return value;
}

/** Jev 的数字原样保留；只挡格式不对的，不改任何一个值。 */
export function parsePortraitAnswers(result: JevResult): PortraitAnswers {
  const answers = {} as PortraitAnswers;
  for (const axis of PORTRAIT_AXES) {
    const score = result.answers[axis.key] as Record<string, unknown> | undefined;
    const evidence = result.answers[`${axis.key}_evidence`] as
      | Record<string, unknown>
      | undefined;
    if (!score || score.type !== "score") throw new Error(`${axis.key} 缺少档位`);
    if (!evidence || evidence.type !== "noul") {
      throw new Error(`${axis.key} 缺少依据判断`);
    }
    const raw = score.probabilities as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") throw new Error(`${axis.key} 缺少概率`);
    const probabilities = Array.from({ length: PORTRAIT_LEVELS }, (_, level) =>
      probability(raw[String(level)], `${axis.key}[${level}]`)
    );
    const sum = probabilities.reduce((a, b) => a + b, 0);
    // Jev 把概率四舍五入到两位小数，加起来允许差一点。
    if (Math.abs(sum - 1) > PORTRAIT_LEVELS * 0.005 + 0.001) {
      throw new Error(`${axis.key} 概率加起来不是 1`);
    }
    const value = score.score;
    if (typeof value !== "number" || value < 0 || value > PORTRAIT_LEVELS - 1) {
      throw new Error(`${axis.key} 档位越界`);
    }
    const entry: PortraitAxisResult = {
      score: value,
      confidence: probability(score.confidence, `${axis.key}.confidence`),
      probabilities,
      evidence: probability(evidence.noul, `${axis.key}.evidence`),
    };
    answers[axis.key] = entry;
  }
  return answers;
}

export async function readPortrait(
  picked: Writing[],
  userId: string
): Promise<{
  answers: PortraitAnswers;
  model: string;
  usage: JevResult["usage"];
}> {
  return executeJev(
    {
      userId,
      operation: "self_portrait",
      module: "self",
      promptVersion: "portrait_v1",
      // 送去的全是本人原文，日志只记元数据。
      payloadLogging: "metadata_only",
    },
    { state: renderWritings(picked), questions: buildPortraitQuestions() },
    (result) => ({
      answers: parsePortraitAnswers(result),
      model: result.model,
      usage: result.usage,
    })
  );
}
