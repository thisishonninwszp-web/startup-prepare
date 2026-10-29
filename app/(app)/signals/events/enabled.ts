export function eventsEnabled(): boolean {
  return process.env.SIGNAL_EVENTS_ENABLED === "true";
}
