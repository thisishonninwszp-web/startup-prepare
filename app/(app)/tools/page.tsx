import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";

const TOOLS = [
  {
    href: "/reasoning",
    title: "推理工具",
    description: "贝叶斯 / 费米 / 第一性原理 / 外部视角 / 认知重构",
  },
  {
    href: "/council",
    title: "顾问团",
    description: "跨学科视角的对抗性质疑",
  },
  {
    href: "/outreach",
    title: "触达规划",
    description: "验证行动的触达画布",
  },
  {
    href: "/decoy",
    title: "假方案",
    description: "AI 给一份埋了雷的方案，你找茬，然后写出自己的方案",
  },
];

export default function ToolsPage() {
  return (
    <PageContainer width="default">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">工具</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          不常驻导航的思考工具。它们通常从想法或工作台的上下文中唤起,这里是直接入口。
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="rounded-lg border bg-card p-5 transition-colors hover:bg-muted"
          >
            <h2 className="text-sm font-medium">{tool.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
