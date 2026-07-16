import { redirect } from "next/navigation";

// 公司知识库已并入 /companies 的「公司知识库」tab（宪法：companies 吞并 company-kb）。
export default function CompanyKbRedirect() {
  redirect("/companies?tab=kb");
}
