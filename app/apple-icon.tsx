import { ImageResponse } from "next/og";

// iOS 主屏图标（真 PNG，由代码生成）。Next 自动注入 apple-touch-icon。
// ImageResponse 为 Edge runtime 设计，Node worker 下会崩，故显式声明 edge。
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#18181b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", width: 104, height: 104, display: "flex" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "11px solid #fafafa",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 2,
              bottom: 2,
              width: 38,
              height: 11,
              background: "#fafafa",
              borderRadius: 6,
              transform: "rotate(45deg)",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
