"use client";
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DailyCase } from '@/lib/domains/business-teardowns/domain';
import { loadBusinessHistoryAction } from './actions';

export function BusinessHistoryPanel({ initialHistory }: { initialHistory: { items: DailyCase[]; nextCursor: string | null } }) {
  const [history, setHistory] = useState(initialHistory), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const flight = useRef(false);
  return <section className="space-y-3 rounded-lg border bg-card p-5" aria-label="生意案例历史"><h2 className="text-base font-medium">以前的一家店</h2><p className="text-xs leading-6 text-muted-foreground">按东京日期保留当时的店铺与材料；材料未完成的日子也占用原槽位。</p>
    {!history.items.length && <p className="text-sm text-muted-foreground">还没有历史案例。</p>}
    <ul className="divide-y">{history.items.map(item => <li key={item.id} className="py-3"><Link href={`/business-lab/${item.id}`} className="flex flex-wrap justify-between gap-2 text-sm hover:underline"><time>{item.localDate}</time><span>{item.state === 'ready' ? '材料可读' : item.state === 'preparing' ? '准备中' : '材料未完成'} →</span></Link>{item.failureReason && <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.failureReason}</p>}<p className="mt-1 break-words text-xs leading-6 text-muted-foreground">{item.selectionReason}</p></li>)}</ul>
    {history.nextCursor && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (flight.current) return; flight.current = true; setBusy(true); setMessage(''); try { const page = await loadBusinessHistoryAction({ before: history.nextCursor! }); setHistory(previous => ({ items: [...previous.items, ...page.items.filter(item => !previous.items.some(old => old.id === item.id))], nextCursor: page.nextCursor })); } catch (error) { setMessage(error instanceof Error ? error.message : '历史读取未完成，请重试。'); } finally { flight.current = false; setBusy(false); } }}>{busy ? '读取中……' : '读取更早案例'}</Button>}
    {message && <p role="status" className="text-xs leading-6">{message}</p>}
  </section>;
}
