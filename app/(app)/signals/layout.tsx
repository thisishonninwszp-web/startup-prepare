import type { ReactNode } from "react";
import { SignalsNav } from "./signals-nav";

/** 外部信号每一页的顶上都有同一条二级导航（AppShell 只在 app/(app)/layout.tsx 挂一次，这里不再引）。 */
export default function SignalsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SignalsNav />
      {children}
    </>
  );
}
