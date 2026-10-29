type RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const fallback = new Map<string, string>();

// Persist only a digest and UUID: draft notes and source quotations stay out of storage.
export async function eventRequest(operation: string, payload: unknown, storage?: RequestStorage) {
  const bytes = new TextEncoder().encode(JSON.stringify([operation, payload]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  const key = `ideaos:event-request:${hash}`;
  let target = storage;
  try { target ??= window.sessionStorage; } catch { /* Private browser settings may disable storage. */ }
  let requestId = fallback.get(key);
  try { requestId = target?.getItem(key) ?? requestId; } catch { /* Keep retries safe within this page. */ }
  requestId ??= crypto.randomUUID();
  fallback.set(key, requestId);
  try { target?.setItem(key, requestId); } catch { /* Keep the in-memory identity when storage is full. */ }
  return {
    requestId,
    complete() {
      fallback.delete(key);
      try { target?.removeItem(key); } catch { /* A stale UUID remains safe for an identical retry. */ }
    },
  };
}
