import { ReframingForm } from "./reframing-form";

export default async function NewReframingPage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">认知重构</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          描述你一时不知道怎么办的课题，AI 用 26 种视角帮你打破思维定势。
        </p>
      </div>
      <ReframingForm ideaId={params.idea_id ?? null} />
    </div>
  );
}
