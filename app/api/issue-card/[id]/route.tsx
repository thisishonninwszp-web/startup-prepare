import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { coverItems, coverTopLabel, type IssueContent, type IssueDrafts } from "@/lib/domains/signals/issue-shared";

// 周刊的小红书封面（3:4，1080×1440）。小红书是看图的平台，没有图的帖子很难被刷到。
// ImageResponse 为 Edge runtime 设计（见 app/apple-icon.tsx），所以这里不引领域层（那边用到 node:dns），
// 直接用登录态的 Supabase 读这一期 —— RLS 只放行他自己的。
export const runtime = "edge";

const WIDTH = 1080;
const HEIGHT = 1440;

// 颜色取自 app/globals.css 的语义 token（图片里用不了 CSS 变量）：
// --background / --foreground / --primary / --muted-foreground / --border。和页面同一套「田野笔记」。
const COLOR = {
  paper: "hsl(40, 20%, 97.5%)",
  ink: "hsl(30, 8%, 12%)",
  accent: "hsl(16, 84%, 47%)",
  muted: "hsl(30, 5%, 42%)",
  rule: "hsl(40, 10%, 87%)",
};

const FOOTER = "每周一期 · 出处都核实过";

/** 只下这张图用到的那几个字（Google Fonts 按 text 参数切子集），中文字体整包太大。 */
async function loadFont(weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("没登录", { status: 401 });

  const { data, error } = await supabase.from("signal_issues").select("week_start, content, drafts").eq("id", params.id).maybeSingle();
  if (error || !data) return new Response("找不到这一期", { status: 404 });

  const content = data.content as IssueContent;
  const drafts = data.drafts as IssueDrafts | null;
  const title = drafts?.zhTitles[0] ?? "那边有、这边还没有";
  const top = coverTopLabel(content.picks);
  const items = coverItems(content.picks);
  const week = `${data.week_start as string} 这一周`;

  const text = [title, top, FOOTER, week, ...items.flatMap((i) => [i.headline, i.stance]), "0123456789…"].join("");
  const [regular, bold] = await Promise.all([loadFont(400, text), loadFont(700, text)]);
  // 字体没拿到就别出一张全是方块的图
  if (!regular || !bold) return new Response("字体没下载下来，刷新再试一次", { status: 503 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: COLOR.paper,
          color: COLOR.ink,
          padding: "100px 96px 72px",
          fontFamily: "NotoSansSC",
        }}
      >
        {/* 内容接近满高时 flex 会把元素压扁（标题第二行和下面那道线叠在一起），一律不许收缩 */}
        <div style={{ display: "flex", flexShrink: 0, fontSize: 32, color: COLOR.accent, fontWeight: 700 }}>{top}</div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 24, fontSize: 68, fontWeight: 700, lineHeight: 1.3 }}>{title}</div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 44, height: 6, width: 120, background: COLOR.accent }} />
        <div style={{ display: "flex", flexShrink: 0, flexDirection: "column", marginTop: 32 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                paddingTop: 28,
                paddingBottom: 28,
                // 最后一条不画线，免得和底下那行贴在一起
                borderBottom: i < items.length - 1 ? `2px solid ${COLOR.rule}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div style={{ display: "flex", width: 84, fontSize: 36, fontWeight: 700, color: COLOR.accent }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{ display: "flex", flex: 1, fontSize: 42, fontWeight: 700, lineHeight: 1.4 }}>{item.headline}</div>
              </div>
              {item.stance && (
                <div style={{ display: "flex", marginTop: 14, marginLeft: 84, fontSize: 32, color: COLOR.muted }}>{item.stance}</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: "auto", justifyContent: "space-between", fontSize: 28, color: COLOR.muted }}>
          <div style={{ display: "flex" }}>{FOOTER}</div>
          <div style={{ display: "flex" }}>{week}</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "NotoSansSC", data: regular, weight: 400, style: "normal" },
        { name: "NotoSansSC", data: bold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "private, max-age=600" },
    }
  );
}
