import type { SourceRef } from "./domain";
export type MechanismLink = { text: string; refs: SourceRef[]; counterexample: string; unknown: string };
export function unresolvedLinks(links: MechanismLink[]): MechanismLink[] { return links.filter(link => Boolean(link.unknown.trim()) || link.refs.length === 0); }
