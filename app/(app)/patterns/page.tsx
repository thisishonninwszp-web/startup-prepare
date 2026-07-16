import { redirect } from "next/navigation";

// 认知镜已并入 /learnings 的「认知镜」tab（宪法：patterns 并入 learnings 报告视图）。
export default function PatternsRedirect() {
  redirect("/learnings?tab=patterns");
}
