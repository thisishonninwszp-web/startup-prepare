import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { getBusinessSchemaStatus, loadDailyCase, loadCaseDetail, listCaseHistory } from '@/lib/domains/business-teardowns/queries';
import { BusinessSourcePanel } from './source-panel';
import { BusinessHistoryPanel } from './history-panel';
import { tokyoDate } from '@/lib/domains/business-teardowns/daily';
import {loadBusinessJobState,businessJobsEnabled} from '@/lib/domains/business-teardowns/jobs/commands';
import {BusinessJobPanel} from './job-panel';
import {LessonLibrary} from './lesson-library';
import {BusinessManualSourceEntry} from './manual-source-panel';

export const dynamic = 'force-dynamic';

export default async function BusinessLabPage() {
  if (process.env.BUSINESS_TEARDOWNS_ENABLED !== 'true') notFound();
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) notFound();
  let content;
  try {
    const available = await getBusinessSchemaStatus();
    if (!available) content = <p role="status" className="rounded-lg border p-5 text-sm leading-6">生意材料库尚未就绪。请先完成 119 迁移，再重新打开本页。</p>;
    else {
      const [today, history] = await Promise.all([loadDailyCase(user.id), listCaseHistory(user.id)]);
      const detail = today ? await loadCaseDetail(user.id, today.id) : null;
      let jobs;try{jobs=await loadBusinessJobState(user.id);}catch{jobs=null;}
      content = <div className="space-y-8">{jobs?<BusinessJobPanel initialState={jobs} enabled={businessJobsEnabled()}/>:<p role="alert" className="rounded-lg border p-5 text-sm">每日任务设置暂时无法读取，请刷新后重试。</p>}<BusinessSourcePanel initialCase={detail} localDate={tokyoDate(new Date())} /><BusinessManualSourceEntry initialCase={detail}/><BusinessHistoryPanel initialHistory={history} /><LessonLibrary/></div>;
    }
  } catch { content = <p role="alert" className="rounded-lg border p-5 text-sm leading-6">材料暂时无法读取。请刷新重试；原有每日槽位和材料不会因读取失败被替换。</p>; }
  return <PageContainer width="wide"><header className="mb-8 space-y-2"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Business lab · Material notebook</p><h1 className="text-2xl font-semibold tracking-tight">每日一门生意</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">从一家店和一个主商品开始，核对来源、购买线索与未知，再亲自确认可比的对照。在独立案例页阅读已发布拆解、核对材料，或在明确许可后生成新草稿；没有报告时保留未知。</p></header>{content}</PageContainer>;
}

