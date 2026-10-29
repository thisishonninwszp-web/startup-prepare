import type { CaseDetail, MaterialSnapshot, QuantityObservation } from '@/lib/domains/business-teardowns/domain';

const metricLabels: Record<QuantityObservation['metric'], string> = {
  pack_contents: '包装含量', units_per_order: '单次下单件数', displayed_sales: '公开销售显示',
  review_count: '评价数量', repeat_mention: '复购叙述',
};
const unitLabels: Record<QuantityObservation['unit'], string> = { pieces: '件', packs: '包 / 盒', orders: '单', buyers: '买家', mentions: '次提及', unknown: '单位未知' };
const attributionLabels: Record<QuantityObservation['attribution'], string> = { platform: '平台显示', merchant: '商家自述', review_excerpt: '评价摘录', user_supplied: '用户提供' };

function publicLink(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; }
}
function display(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

export function MaterialView({ snapshot }: { snapshot: MaterialSnapshot }) {
  const link = publicLink(snapshot.sourceUrl);
  const price = display(snapshot.structured.itemPrice) ?? display(snapshot.structured.price);
  const currency = display(snapshot.structured.currency);
  const ranges = [1, 2, 3].flatMap(index => {
    const min = display(snapshot.structured[`itemPriceMin${index}`]), max = display(snapshot.structured[`itemPriceMax${index}`]);
    return min !== null || max !== null ? [`${min ?? '下限未知'} — ${max ?? '上限未知'}（原字段组 ${index}）`] : [];
  });
  return <article className="min-w-0 space-y-4 rounded-lg border bg-background p-4">
    <div className="space-y-1 text-xs leading-6 text-muted-foreground">
      <p>{snapshot.origin === 'official_api' ? '官方 API 字段' : snapshot.origin === 'manual_excerpt' ? '手动摘录 · 未独立核实' : '公开摘录'} · {snapshot.platform === 'rakuten' ? '乐天' : '小红书'}</p>
      <p>捕获日期：<time dateTime={snapshot.capturedAt}>{snapshot.capturedAt}</time></p>
      <p>{snapshot.publishedAt ? `发布时间：${snapshot.publishedAt}` : '发布时间未知'}</p>
      {display(snapshot.structured.dateSeen)&&<p>看见材料的日期：{display(snapshot.structured.dateSeen)}（用户记录，独立于发布时间）</p>}
      {display(snapshot.structured.accessStatus)&&<p>材料可见状态：{{public:'公开可读',partial:'部分可见',login_required:'需要登录',unavailable:'无法访问'}[String(snapshot.structured.accessStatus)]??'尚未说明'}</p>}
      {display(snapshot.structured.gaps)&&<p>材料缺口：{display(snapshot.structured.gaps)}</p>}
      <p>材料覆盖：{snapshot.coverage}</p>
      {link && <a className="block break-all underline underline-offset-4" href={link} target="_blank" rel="noreferrer">核对原始来源 ↗</a>}
    </div>
    <div className="space-y-1 break-words text-sm">{ranges.length ? <><p>来源价格范围：{ranges.join('；')} · {currency ?? '币种未说明'}</p><p className="text-xs text-muted-foreground">计价单位、套餐与价格字段含义以原始来源为准；不从区间挑选代表售价。</p></> : <p>{price ? `来源标价：${price} ${currency ?? '币种未说明'}；计价单位以原始来源为准` : '价格与计价单位未知'}</p>}</div>
    <dl className="divide-y rounded-md border text-xs leading-6">
      {(Object.entries(metricLabels) as [QuantityObservation['metric'], string][]).map(([metric, label]) => {
        const quantities = snapshot.quantities.filter(quantity => quantity.metric === metric);
        return <div key={metric} className="grid gap-1 p-3 sm:grid-cols-[8rem_1fr]"><dt className="font-medium">{label}</dt><dd className="min-w-0 space-y-2">{quantities.length ? quantities.map(quantity => <div key={quantity.id} className="break-words"><p>{quantity.raw}</p><p className="text-muted-foreground">{quantity.relation === 'gte' ? '下界' : quantity.relation === 'eq' ? '明确数值' : '数值未知'}：{quantity.value ?? '未知'} · {unitLabels[quantity.unit]} · {attributionLabels[quantity.attribution]}</p><p className="text-muted-foreground">时段：{quantity.period.label ?? ([quantity.period.from, quantity.period.to].filter(Boolean).join(' — ') || '未说明')}；样本：{quantity.sampleScope}</p></div>) : <span className="text-muted-foreground">未知：材料未提供</span>}</dd></div>;
      })}
    </dl>
    <p className="text-xs leading-6 text-muted-foreground">包装含量、下单件数、销量与评价数量各自保留；单条叙述不能推出全店平均值、买家比例或复购率。</p>
    <details><summary className="cursor-pointer text-xs">展开原文与来源字段</summary>{snapshot.capturedText && <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 pl-3 text-xs leading-6">{snapshot.capturedText}</blockquote>}<pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-3 text-[11px]">{JSON.stringify(snapshot.structured, null, 2)}</pre></details>
  </article>;
}

export function CaseMaterialView({ detail }: { detail: CaseDetail }) {
  const { dailyCase, merchant, members } = detail;
  const primary = members.filter(member => member.role !== 'comparison');
  const comparisons = members.filter(member => member.role === 'comparison');
  return <div className="space-y-6">
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">{dailyCase.localDate} · Asia/Tokyo · 材料版本 {dailyCase.revision}</p>
      <h2 className="break-words text-xl font-medium">{merchant.name}</h2>
      <p className="break-all text-xs text-muted-foreground">{merchant.platform === 'rakuten' ? '乐天' : '小红书'} · 店铺 ID：{merchant.platformShopId}{merchant.identityScope === 'user_supplied_unverified' ? ' · 用户提供，身份未独立核实' : ''}</p>
      <p className="text-sm leading-6">{dailyCase.state === 'ready' ? '材料可读' : dailyCase.state === 'preparing' ? '材料准备中' : '今日材料未完成'}{dailyCase.failureReason ? `：${dailyCase.failureReason}` : ''}</p>
      <p className="text-xs leading-6 text-muted-foreground">选题原因：{dailyCase.selectionReason}</p>
      <p className="text-xs leading-6 text-muted-foreground">这是公开材料事实模板。购买动机、真实成本与利润、完整购买过程仍待核对；阅读不等于真实需求验证。</p>
    </section>
    <section className="space-y-3"><h2 className="text-base font-medium">主店铺与主商品</h2>{primary.length ? primary.map(member => <MaterialView key={member.snapshot.id} snapshot={member.snapshot} />) : <p className="text-sm text-muted-foreground">主商品材料尚未准备完成。</p>}</section>
    <section className="space-y-3"><h2 className="text-base font-medium">对照店</h2>{comparisons.length ? comparisons.map(member => <div key={member.snapshot.id} className="space-y-2"><p className="break-words text-sm">{member.merchant.name} · 店铺 ID：{member.merchant.platformShopId}</p><MaterialView snapshot={member.snapshot} /></div>) : <p className="text-sm leading-6 text-muted-foreground">尚未确认对照店。用途、规格、价格构成、配送、促销和时间窗口未核对前，不能判断谁更便宜或更畅销。</p>}</section>
    <aside className="rounded-lg border border-dashed p-4 text-xs leading-6"><h2 className="font-medium">已知购买线索与未知</h2><p className="mt-2">来源中的包装、评价或复购叙述可逐项核对。谁为什么买、全店销量、顾客构成、实际利润与经营负担仍未知；没有这些材料时不补写顾客画像。</p></aside>
  </div>;
}
