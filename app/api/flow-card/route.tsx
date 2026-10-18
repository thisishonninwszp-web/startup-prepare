import { ImageResponse } from "next/og";
import { loadOgFont } from "@/lib/og-font";
import { FLOW_STEPS, type FlowStep } from "@/lib/domains/signals/flow-shared";
import { readFlowCard } from "@/lib/domains/signals/flow-card-shared";

// 邮件里的「一图看懂」：标题 + 四个框加箭头，画成 1200×560 的 PNG。只画定时任务签过名的内容（见 flow-card-shared.ts）。
// 和 /api/issue-card 一样用 Edge runtime（next/og 在本机 Node 下找字体会出错）；只引纯函数，不引用到 node:dns 的领域层。
export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 560;

// 颜色取自 app/globals.css 的语义 token（图片里用不了 CSS 变量），和封面图同一套。
const COLOR = {
  paper: "hsl(40, 20%, 97.5%)",
  card: "hsl(0, 0%, 100%)",
  ink: "hsl(30, 8%, 12%)",
  accent: "hsl(16, 84%, 47%)",
  muted: "hsl(30, 5%, 42%)",
  rule: "hsl(40, 10%, 87%)",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const card = await readFlowCard(params.get("d") ?? "", params.get("s") ?? "", process.env.CRON_SECRET ?? "");
  if (!card) return new Response("签名对不上", { status: 403 });

  const steps = Object.keys(FLOW_STEPS) as FlowStep[];
  const text = ["一图看懂→", card.headline, ...steps.flatMap((s) => [FLOW_STEPS[s], card.flow[s]])].join("");
  const [regular, bold] = await Promise.all([loadOgFont(400, text), loadOgFont(700, text)]);
  if (!regular || !bold) return new Response("字体没下载下来", { status: 503 });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: COLOR.paper, padding: 48, fontFamily: "Noto Sans SC" }}>
        <div style={{ display: "flex", fontSize: 22, color: COLOR.accent }}>一图看懂</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 34, fontWeight: 700, color: COLOR.ink, lineHeight: 1.4 }}>{card.headline}</div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", marginTop: 24 }}>
          {steps.map((step, i) => (
            <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 220,
                  padding: "18px 20px",
                  borderRadius: 12,
                  background: COLOR.card,
                  border: `3px solid ${step === "watch" ? COLOR.accent : COLOR.rule}`,
                }}
              >
                <div style={{ display: "flex", fontSize: 22, color: COLOR.muted }}>{FLOW_STEPS[step]}</div>
                <div style={{ display: "flex", marginTop: 10, fontSize: 28, color: COLOR.ink, lineHeight: 1.5 }}>{card.flow[step]}</div>
              </div>
              {i < steps.length - 1 && <div style={{ display: "flex", padding: "0 10px", fontSize: 34, color: COLOR.muted }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Noto Sans SC", data: regular, weight: 400 },
        { name: "Noto Sans SC", data: bold, weight: 700 },
      ],
    }
  );
}
