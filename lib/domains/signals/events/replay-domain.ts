export type ReplayMode = "archived" | "recovered";
export type ReplayMaterial = { title: string; text: string; url: string | null; publishedAt: string | null; capturedAt: string | null; retrospective: boolean; action: "include" | "exclude"; availableAt: string; source: string };
export type ReplayView = { id: string; cutoff: string; mode: ReplayMode; guess: string | null; revealed: number; materials: ReplayMaterial[]; complete: boolean };
export function replayInput(cutoff: string, mode: string): { cutoff: string; mode: ReplayMode } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(cutoff) || !Number.isFinite(Date.parse(cutoff)) || new Date(`${cutoff.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) !== cutoff.slice(0,10) || !["archived", "recovered"].includes(mode)) throw new Error("请选择有效的 UTC 截止时间和回放模式");
  return { cutoff: new Date(cutoff).toISOString(), mode: mode as ReplayMode };
}
export function replayExport(view: ReplayView): string {
  return JSON.stringify({ title: "历史材料回放", cutoff: view.cutoff, mode: view.mode, caveat: view.mode === "recovered" ? "回溯补录：使用当前策展集合，可能包含事后获知的信息；不是干净的 AI 盲测。" : "仅回放当时已存档的版本及当时的归属记录；不是 AI 盲测。", practiceGuess: view.guess, revealedMaterials: view.materials.map(({title,text,url,publishedAt,capturedAt,retrospective,action,availableAt,source}) => ({title,text,url,publishedAt,capturedAt,retrospective,action,availableAt,source})) }, null, 2);
}
