"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      打印 / 存成 PDF
    </Button>
  );
}
