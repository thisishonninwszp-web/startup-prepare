export type ReadingSessionState = {
  available: boolean;
  opensAvailable: boolean;
  openedIds: string[];
  stoppedIds: string[] | null;
  stoppedAt: string | null;
};

export function readingSummary(ids: string[], openedIds: string[], stoppedIds: string[] | null) {
  const current = [...new Set(ids)];
  const opened = new Set(openedIds);
  const stopped = stoppedIds === null ? null : new Set(stoppedIds);
  const count = current.filter((id) => opened.has(id)).length;
  return {
    total: current.length,
    opened: count,
    remaining: current.length - count,
    added: stopped ? current.filter((id) => !stopped.has(id)).length : 0,
    stopped: stopped !== null,
  };
}

export function validReadingDate(value: unknown, today: string): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readingSnapshot(requested: string[], allowed: string[]): string[] {
  const valid = new Set(allowed);
  const ids = [...new Set(requested)].filter((id) => valid.has(id));
  if (!ids.length) throw new Error("这一份还没有可以结束阅读的精选。");
  return ids;
}
