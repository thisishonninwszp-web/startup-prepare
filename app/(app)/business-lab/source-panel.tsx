"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ConnectedForm, Choice, Field, value } from '../workbench/connected-form';
import type { CaseDetail, DailyCase, MerchantInput, Platform } from '@/lib/domains/business-teardowns/domain';
import type { BusinessCandidate } from '@/lib/domains/business-teardowns/providers/rakuten';
import { tokyoDate } from '@/lib/domains/business-teardowns/daily';
import { searchBusinessCandidates, selectBusinessCandidate, createManualBusinessCase, attachManualBusinessMaterial, attachBusinessComparison, loadBusinessCaseAction } from './actions';
import { CaseMaterialView } from './material-view';

export function businessCandidateAction(detail: CaseDetail | null, merchant: Pick<MerchantInput, 'platform' | 'platformShopId'>) {
  if (!detail) return 'primary';
  const sameShop = merchant.platform === detail.merchant.platform && merchant.platformShopId === detail.merchant.platformShopId;
  if (!sameShop) return 'comparison';
  return detail.members.some(member => member.role === 'primary') ? 'already_primary' : 'retry_primary';
}

function candidatePrice(fields: Record<string, unknown>) {
  const ranges = [1, 2, 3].flatMap(index => {
    const min = fields[`itemPriceMin${index}`], max = fields[`itemPriceMax${index}`];
    return min != null || max != null ? [`${min ?? '下限未知'} — ${max ?? '上限未知'}`] : [];
  });
  return ranges.length ? `来源价格范围：${ranges.join('；')} JPY` : fields.itemPrice != null ? `来源标价：${fields.itemPrice} JPY` : '价格未知';
}

export function BusinessSourcePanel({ initialCase, localDate = tokyoDate(new Date()) }: { initialCase: CaseDetail | null; localDate?: string }) {
  return <SourceSession key={initialCase ? `${initialCase.dailyCase.id}:${initialCase.dailyCase.revision}` : localDate} initialCase={initialCase} localDate={localDate} />;
}

function SourceSession({ initialCase, localDate }: { initialCase: CaseDetail | null; localDate: string }) {
  const [detail, setDetail] = useState(initialCase);
  const [candidates, setCandidates] = useState<BusinessCandidate[]>([]);
  const [coverage, setCoverage] = useState('');
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const searchFlight = useRef(false), mutationFlight = useRef(false), active = useRef(true);
  const savedCase = useRef<string | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = detail?.dailyCase;
  const needsPrimary = detail && !detail.members.some(member => member.role === 'primary');
  const context = current ? `${current.id}:${current.revision}` : `today-new:${localDate}`;

  async function mutate(run: () => Promise<DailyCase>) {
    if (mutationFlight.current) return { ok: false, message: '另一项材料正在保存，请稍后重试。' };
    mutationFlight.current = true;
    try { const result = await run(); savedCase.current = result.id; return { ok: true }; }
    finally { mutationFlight.current = false; }
  }
  async function reload() {
    const id = savedCase.current ?? current?.id;
    if (!id) throw new Error('无法定位已保存案例，请重新打开今日页');
    const next = await loadBusinessCaseAction({ caseId: id });
    if (!next) throw new Error('已保存案例暂时无法读取');
    if (active.current) { setDetail(next); setCandidates([]); }
  }
  function manualFields() {
    return <>
      <Choice name="platform" label="材料平台" options={[["rakuten", "乐天"], ["xiaohongshu", "小红书"]]} />
      <Field name="platformShopId" label="平台店铺 ID（明确的店铺标识，不填商品 ID）" required maxLength={200} />
      <Field name="name" label="店铺名称" required maxLength={200} />
      <Field name="sourceUrl" label="公开来源 HTTPS 链接" type="url" required maxLength={2048} />
      <Field name="capturedText" label="已去标识的公开摘录 / 截图转写" multiline required maxLength={10000} />
      <Field name="coverage" label="可见范围与缺口（如：仅一段商品说明，评论不可见）" multiline required />
      <Field name="publishedAt" label="来源发布时间（可留空，ISO 日期）" maxLength={64} />
      <Field name="selectionReason" label={current ? '为什么补充这份材料，哪些条件不可比' : '为什么选这家店作为今日案例'} multiline required />
      <p className="text-xs leading-6 text-muted-foreground">只粘贴选定的公开内容，先去掉买家昵称、头像、姓名、邮件和联系方式。手动店铺身份与摘录未独立核实；小红书材料不表示已接通店铺订单接口。捕获时间由服务端记录。</p>
      <label className="flex items-start gap-2 text-xs leading-6"><input name="confirmed" type="checkbox" required /><span>{current ? '我已核对来源和店铺身份，明确确认把所选材料加入当前案例。' : '我已核对店铺身份、来源和可见范围，确认选择为今日主案例。'}</span></label>
    </>;
  }
  return <div className="space-y-6">
    {detail && <><CaseMaterialView detail={detail} /><Link className="inline-block text-xs underline underline-offset-4" href={`/business-lab/${detail.dailyCase.id}`}>打开独立材料页 →</Link></>}
    <section className="min-w-0 rounded-lg border bg-card p-5" aria-label="材料与候选">
      <h2 className="text-base font-medium">{current ? '补充来源与对照' : '确认今日的一家店'}</h2>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{current ? '今天始终保留同一家主店。对照需要亲自确认，不因评价数量少就认定经营失败。' : '先查一个关键词，核对店铺和主商品后再确认。候选只是材料入口，不是商机推荐。'}</p>
      {needsPrimary && <p className="mt-2 text-xs leading-6">补齐今日主店材料：重新查找相同平台与店铺 ID 的商品，再选择“重试今日主店与商品”；也可在下方手动补充该主店公开材料。今天的案例保持不变。</p>}
      <form className="mt-4 space-y-3" aria-busy={searching} onSubmit={async event => {
        event.preventDefault(); if (searchFlight.current) return;
        searchFlight.current = true; setSearching(true); setMessage('');
        const keyword = value(new FormData(event.currentTarget), 'keyword');
        try { const result = await searchBusinessCandidates({ keyword }); if (active.current) { setCandidates(result.items); setCoverage(result.coverage); if (!result.items.length) setMessage('没有返回候选。可换关键词，或手动提供公开材料。'); } }
        catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : '候选读取未完成，关键词已保留。'); }
        finally { searchFlight.current = false; if (active.current) setSearching(false); }
      }}><Field name="keyword" label="商品或经营场景关键词" required maxLength={100} /><Button type="submit" size="sm" variant="outline" disabled={searching}>{searching ? '正在查找……' : '查找乐天候选'}</Button></form>
      {message && <p role="status" className="mt-3 text-xs leading-6">{message}</p>}
      {coverage && <p className="mt-3 text-xs leading-6 text-muted-foreground">检索覆盖：{coverage}；不是全平台普查。</p>}
      <div className="mt-4 space-y-3">{candidates.map(candidate => {
        const action = businessCandidateAction(detail, candidate.merchant);
        const isComparison = action === 'comparison';
        return <article key={candidate.itemCode} className="min-w-0 rounded-md border p-4">
        <h3 className="break-words text-sm font-medium">{candidate.itemName}</h3><p className="mt-1 break-words text-xs leading-6">{candidate.merchant.name} · 店铺 ID：{candidate.merchant.platformShopId}</p>
        <p className="break-words text-xs leading-6 text-muted-foreground">{candidatePrice(candidate.price)}；计价单位以来源为准；评价数量：{candidate.reviewCount ?? '未知'}{candidate.rank !== null ? `；榜单名次：${candidate.rank}` : ''}</p>
        <p className="text-xs leading-6 text-muted-foreground">材料覆盖：{candidate.coverage}</p>
        <a href={candidate.itemUrl} target="_blank" rel="noreferrer" className="text-xs underline">先核对商品来源 ↗</a>
        {action === 'already_primary' ? <p className="mt-2 text-xs leading-6 text-muted-foreground">这已是今日主店。可在下方手动补充材料，换商品不会成为新的主案例。</p> : <ConnectedForm operation={`business-select:${context}:${action}:${candidate.merchant.platformShopId}:${candidate.itemCode}`} label={isComparison ? '明确确认这家对照店' : action === 'retry_primary' ? '重试今日主店与商品' : '确认今日主店与商品'} onSaved={reload} submit={async (form, requestId) => {
          if (form.get('confirmed') !== 'on') return { ok: false, message: '请先核对并明确确认选择。' };
          const input = { requestId, shopCode: candidate.merchant.platformShopId, itemCode: candidate.itemCode, selectionReason: value(form, 'selectionReason') };
          return mutate(() => isComparison && current ? attachBusinessComparison({ ...input, caseId: current.id, expectedRevision: current.revision }) : selectBusinessCandidate(input));
        }}><Field name="selectionReason" label={isComparison ? '选择对照的理由与不可比条件' : '选择理由与材料缺口'} multiline required /><label className="flex items-start gap-2 text-xs leading-6"><input name="confirmed" type="checkbox" required /><span>{isComparison ? '我已核对用途、规格、价格构成、配送、促销与时间窗口，明确确认作为对照。' : '我确认按平台店铺 ID 选择这家主店；换 SKU 仍是同一家店。'}</span></label></ConnectedForm>}
      </article>; })}</div>
      <details className="mt-5"><summary className="cursor-pointer text-sm">手动提供公开材料</summary><ConnectedForm operation={`business-manual:${context}`} label={current ? '确认并保存所选材料' : '确认主店并保存材料'} onSaved={reload} submit={async (form, requestId) => {
        if (form.get('confirmed') !== 'on') return { ok: false, message: '请明确确认来源、店铺身份和所选材料。' };
        const input = { requestId, platform: value(form, 'platform') as Platform, platformShopId: value(form, 'platformShopId'), name: value(form, 'name'), sourceUrl: value(form, 'sourceUrl'), capturedText: String(form.get('capturedText') ?? ''), coverage: value(form, 'coverage'), selectionReason: value(form, 'selectionReason'), publishedAt: value(form, 'publishedAt') || undefined };
        return mutate(() => current ? attachManualBusinessMaterial({ ...input, caseId: current.id, expectedRevision: current.revision, role: value(form, 'role') as 'product' | 'comparison' }) : createManualBusinessCase(input));
      }}>{current && <Choice name="role" label="材料用途" options={[["product", "当前主店补充材料"], ["comparison", "我明确选择的对照店材料"]]} />}{manualFields()}</ConnectedForm></details>
    </section>
  </div>;
}
