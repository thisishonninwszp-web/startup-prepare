import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageContainer } from '@/components/ui/page-container';
import { createClient } from '@/lib/supabase/server';
import { loadCaseDetail } from '@/lib/domains/business-teardowns/queries';
import { CaseMaterialView } from '../material-view';
import { BusinessReportPanel } from '../report-panel';
import { BusinessLearningPanel } from '../learning-panel';

export const dynamic = 'force-dynamic';
export default async function BusinessCasePage({ params }: { params: { caseId: string } }) {
  if (process.env.BUSINESS_TEARDOWNS_ENABLED !== 'true') notFound();
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.caseId)) notFound();
  const detail = await loadCaseDetail(user.id, params.caseId);
  if (!detail) notFound();
  return <PageContainer width="wide"><Link href="/business-lab" className="mb-6 inline-block text-xs text-muted-foreground hover:underline">← 今日与历史</Link><header className="mb-6"><h1 className="text-2xl font-semibold tracking-tight">店铺经营拆解</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">先读可核对的解释与未知，再按需展开冻结原文、材料日期和覆盖范围。</p></header><BusinessReportPanel caseId={detail.dailyCase.id} materialRevision={detail.dailyCase.revision} /><details className="mt-6"><summary className="cursor-pointer text-sm font-medium">核对冻结材料、覆盖缺口与对照</summary><div className="mt-4"><CaseMaterialView detail={detail} /></div></details><BusinessLearningPanel detail={detail}/></PageContainer>;
}


