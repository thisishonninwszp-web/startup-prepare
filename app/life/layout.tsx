import { AppShell } from "@/components/app-shell";
import type { ReactNode } from "react";

export default function LifeLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <main className="min-h-screen">{children}</main>
    </AppShell>
  );
}
