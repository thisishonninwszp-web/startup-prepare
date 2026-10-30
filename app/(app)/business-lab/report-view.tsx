import type { CaseRevision, ReportSource, CaseSection } from '@/lib/domains/business-teardowns/report-domain';
import { MaterialView } from './material-view';
import type { QuantityObservation } from '@/lib/domains/business-teardowns/domain';
import {hasBusinessReportGaps,canPublishBusinessReport} from '@/lib/domains/business-teardowns/report-domain';
export const REPORT_SECTION_LABELS:Record<CaseSection['key'],string>={offering:'店铺与商品',trigger:'购买触发',buyers:'顾客与购买量',volume:'热销依据',journey:'购买过程',value:'顾客付钱买什么',operations:'经营动作',economics:'收入与成本',comparison:'对照分析',failure_conditions:'失效条件',transfer:'借鉴与改进',experiment:'最小验证'};
export function BusinessReportView({report,sources,published}:{report:CaseRevision;sources:ReportSource[];published:boolean}) {
 if(report.erasedAt)return <p>此版本正文已清除。</p>;
 const firstInterpretation=report.sections.flatMap(s=>s.interpretations)[0];
 return <article className="min-w-0 space-y-4 rounded-lg border bg-card p-5" aria-label="经营拆解报告">
 <header><p className="text-xs text-muted-foreground">{published?'已发布':'草稿 · 尚未发布'} · 报告版本 {report.revision} · 材料版本 {report.materialRevision}</p><h2 className="mt-2 text-lg font-medium">可核对的经营拆解</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">解释均待核对。没有成本不能计算真实利润；包装、评价数量不能代替销量或顾客比例。对照条件未核对不能认定因果。</p></header><div className="grid gap-2 sm:grid-cols-2">{sources.map(source=><SourcePrice key={source.id} source={source}/>)}</div>
 <aside className="rounded border border-dashed p-3 text-sm leading-6"><h3 className="font-medium">先读最值得核对的解释</h3><p>{report.sections.flatMap(s=>s.interpretations)[0]?.text??'当前材料尚不足以提出经营解释。'}</p>{firstInterpretation&&<><p className="mt-2 text-xs">竞争解释：{firstInterpretation.competingExplanation}</p><p className="text-xs">区分问题：{firstInterpretation.distinguishingObservation}</p></>}<p className="mt-2 text-xs">最大的未知：{report.sections.flatMap(s=>s.unknowns)[0]??'需要继续核对解释与真实经营条件。'}</p></aside>
 {hasBusinessReportGaps(report.sections)&&<aside className="rounded border p-3 text-xs leading-6" aria-label="报告校验缺口"><h3 className="font-medium">报告存在校验缺口</h3><p>仅展示通过规则检查的内容，被剔除内容未展示。规则检查不代表解释已获证实；各节会标明剔除范围，这与来源本身的未知不同。</p>{!canPublishBusinessReport(report.sections)&&<p>没有通过校验的经营解释，此部分报告不能发布。</p>}</aside>}
 {report.sections.map(section=><details key={section.key} data-report-section={section.key} className="min-w-0 rounded border p-3"><summary className="cursor-pointer text-sm font-medium">{REPORT_SECTION_LABELS[section.key]}{section.validationGaps?.length?' · 有校验缺口':''}</summary><div className="mt-3 space-y-4 text-sm leading-6">
 {section.validationGaps?.length&&<div className="rounded border p-3 text-xs" aria-label="本节校验缺口"><h4 className="font-medium">AI 输出未通过校验</h4>{section.validationGaps.map((gap,index)=><p key={index}>{gap.field==='observations'?'数值引用':gap.field==='interpretations'?'解释与竞争解释':'未知项表述'}：已剔除 {gap.count} 条（{gap.reason==='citation_rejected'?'来源或引文无法核对':'内容不符合报告规则'}）。</p>)}<p>被剔除内容未展示，也未自动重新生成。</p></div>}
 <div><h4 className="text-xs font-medium">来源中的事实</h4>{section.observations.length?section.observations.map((observation,i)=>{const source=sources.find(s=>s.id===observation.snapshotId);const metric=source?.quantities.find(q=>q.id===observation.metricId);return <div key={i} className="mt-2"><p>{metric?metricFact(metric):'该字段请展开冻结来源核对；不可推导未提供的数据。'}</p>{source?<details><summary className="cursor-pointer text-xs underline">展开冻结来源字段 · {source.role==='comparison'?'对照店':'主店材料'}</summary><MaterialView snapshot={source}/></details>:<p>来源已不可读，不能继续作为事实依据。</p>}</div>}):<p className="text-xs text-muted-foreground">未知：本节没有可引用的已保存数值事实。</p>}</div>
 {section.interpretations.map((interpretation,i)=><div key={i} className="space-y-2 border-l-2 pl-3"><p>待核对的解释：{interpretation.text}</p><p>竞争解释：{interpretation.competingExplanation}</p><p>区分两种解释的新观察：{interpretation.distinguishingObservation}</p>{!interpretation.refs.length&&<p className="text-xs">无直接引用：仅是假设。</p>}{interpretation.refs.map((ref,j)=>{const source=sources.find(s=>s.id===ref.snapshotId);return <details key={j}><summary className="cursor-pointer text-xs underline">查看引文与来源 · {source?.role==='comparison'?'对照店':'主店材料'}</summary><blockquote className="my-2 whitespace-pre-wrap break-words border-l-2 pl-3">{ref.quote}</blockquote>{source?<MaterialView snapshot={source}/>:<p className="text-xs">来源已不可读，原引文待重新核对。</p>}</details>})}</div>)}
 <div className="rounded bg-muted/40 p-3 text-xs"><h4 className="font-medium">仍未知</h4>{section.unknowns.length?section.unknowns.map((unknown,i)=><p key={i}>{unknown}</p>):<p>尚需核对来源覆盖与解释的适用范围。</p>}</div></div></details>)}
 </article>;
}
function SourcePrice({source}:{source:ReportSource}) {
 const display=(v:unknown)=>typeof v==='number'||typeof v==='string'?String(v):null;
 const fields=source.structured;
 const ranges=[1,2,3].flatMap(i=>{const min=display(fields[`itemPriceMin${i}`]),max=display(fields[`itemPriceMax${i}`]);return min!==null||max!==null?[`${min??'下限未知'} — ${max??'上限未知'}`]:[];});
 const price=display(fields.itemPrice)??display(fields.price);
 return <div className="min-w-0 break-words rounded border p-3 text-xs leading-6"><p>{source.role==='comparison'?'对照店':'主店材料'} · {ranges.length?`来源价格范围：${ranges.join('；')}`:price!==null?`来源标价：${price}`:'价格未知'} · {display(fields.currency)??'币种未知'}</p><p className="text-muted-foreground">采集日期：{source.capturedAt}；{source.coverage}；计价单位以来源为准。</p><details><summary className="cursor-pointer underline">核对这份冻结来源</summary><MaterialView snapshot={source}/></details></div>;
}


function metricFact(metric:QuantityObservation) {
 const labels:Record<QuantityObservation['metric'],string>={pack_contents:'包装含量',units_per_order:'单次下单件数',displayed_sales:'公开销售显示',review_count:'评价数量',repeat_mention:'复购叙述'};
 const units:Record<QuantityObservation['unit'],string>={pieces:'件',packs:'包 / 盒',orders:'单',buyers:'买家',mentions:'次提及',unknown:'单位未知'};
 return `${metric.raw}；${labels[metric.metric]}：${metric.relation==='gte'?'下界':metric.relation==='eq'?'明确数值':'数值未知'} ${metric.value??'未知'} ${units[metric.unit]}；时段：${metric.period.label??([metric.period.from,metric.period.to].filter(Boolean).join(' — ')||'未说明')}；样本：${metric.sampleScope}`;
}
