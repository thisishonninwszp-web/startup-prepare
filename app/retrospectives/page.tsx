import { SystemPreview } from "@/components/system-preview";

export default function RetrospectivesPage() {
  return (
    <SystemPreview
      eyebrow="Retrospective system"
      title="复盘不是总结经历，是修正下一次判断。"
      statement="这个独立系统将对照当初预期、真实结果和行动过程，识别重复出现的判断偏差。现有“判断复盘”仍保留归档想法的学习记录。"
      principles={[
        { label: "对账", text: "先恢复当时的预测，禁止用结果倒推自己早就知道。" },
        { label: "偏差", text: "区分运气、执行和判断本身，不做模糊自我评价。" },
        { label: "规则", text: "每次只沉淀一条下次可以实际使用的判断规则。" },
      ]}
    />
  );
}
