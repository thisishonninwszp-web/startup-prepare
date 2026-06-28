import { FermiForm } from "./fermi-form";

export default async function NewFermiEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">新建费米估算</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把大问题拆解成可以相乘的小组成部分——比直接猜总数更可靠。
        </p>
      </div>
      <FermiForm ideaId={params.idea_id ?? null} />
    </div>
  );
}
