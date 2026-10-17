import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "御社の商売、中国ではどうなっている？",
  robots: { index: false, follow: false },
};

/**
 * 面试时共享屏幕给对方看的页面：不挂导航壳（侧边栏里是他私人的东西），界面是日文。
 * 根布局的 <html lang> 是 zh-CN，这里包一层 lang="ja"，汉字才会用日文字形显示（中文原文另标 zh-CN）。
 */
export default function PresentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="ja" className="min-h-screen bg-background py-10">
      {children}
    </div>
  );
}
