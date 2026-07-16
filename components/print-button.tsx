"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button
      onClick={() => window.print()}
      className="no-print rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
    >
      打印 / 保存为 PDF
    </Button>
  );
}
