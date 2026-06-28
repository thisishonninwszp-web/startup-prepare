import { BayesianForm } from "./bayesian-form";

export default async function NewBayesianBeliefPage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">新建贝��斯信念</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          先写下你现在相信什么，再用证据更新它——防止事后诸葛亮��
        </p>
      </div>
      <BayesianForm ideaId={params.idea_id ?? null} />
    </div>
  );
}
