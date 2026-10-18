/**
 * 画图（next/og 的 ImageResponse）用的中文字体：只下这张图用到的那几个字（Google Fonts 按 text 参数切子集），整包太大。
 * 只用 fetch，Edge 能用。拿不到返回 null —— 调用方别出一张全是方块的图。
 */
export async function loadOgFont(weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
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
