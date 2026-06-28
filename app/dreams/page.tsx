import { SystemPreview } from "@/components/system-preview";

export default function DreamsPage() {
  return (
    <SystemPreview
      eyebrow="Dream system"
      title="先允许未来变得具体，再检查它靠什么成立。"
      statement="梦想系统将帮助你形成小的、长期的和宏大的未来画面。第一阶段以引导想象和文字场景为核心，不生成愿景图片。"
      principles={[
        { label: "画面", text: "把抽象愿望写成某一天真实发生的具体场景。" },
        { label: "尺度", text: "同时容纳近期愿望、长期方向和宏大但未被证明的想象。" },
        { label: "现实", text: "识别前提与代价，但不把梦想强行缩成商业假设。" },
      ]}
    />
  );
}
