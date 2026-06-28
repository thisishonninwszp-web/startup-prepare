import { SystemPreview } from "@/components/system-preview";

export default function CustomerViewPage() {
  return (
    <SystemPreview
      eyebrow="Customer perspective"
      title="不是替顾客想，而是承认你还不知道。"
      statement="顾客视点系统将围绕真实替代方案、切换阻力和付费行为展开。AI的推测永远不能冒充顾客证据。"
      principles={[
        { label: "现状", text: "先看顾客现在如何解决，而不是先讲你的方案。" },
        { label: "阻力", text: "找出顾客为什么不会换、不会付钱、不会现在行动。" },
        { label: "接触", text: "所有分析最终必须回到一次真实顾客接触。" },
      ]}
    />
  );
}
