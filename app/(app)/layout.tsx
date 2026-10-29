import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell businessTeardownsEnabled={process.env.BUSINESS_TEARDOWNS_ENABLED === "true"}>
      <main className="min-h-screen">{children}</main>
    </AppShell>
  );
}
