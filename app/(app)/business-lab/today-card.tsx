import Link from 'next/link';
import { loadDailyCase } from '@/lib/domains/business-teardowns/queries';

export async function BusinessTodayCard({ ownerId }: { ownerId: string }) {
  let text = '今日尚未准备，先确认一家店与公开材料。';
  let href = '/business-lab';
  try {
    const today = ownerId ? await loadDailyCase(ownerId) : null;
    if (today) { href = `/business-lab/${today.id}`; text = today.state === 'ready' ? `${today.localDate} 的材料可读；核对购买线索与未知。` : today.state === 'preparing' ? '今日材料准备中，保留同一主店。' : `今日材料未完成：${today.failureReason ?? '来源暂不可用'}`; }
  } catch { text = '生意材料暂时无法读取，可稍后重试。'; }
  return <Link href={href} className="block rounded-lg border bg-card p-4 hover:bg-muted/30"><h3 className="text-sm font-medium">今日生意 →</h3><p className="mt-1 text-xs leading-6 text-muted-foreground">{text}</p></Link>;
}
