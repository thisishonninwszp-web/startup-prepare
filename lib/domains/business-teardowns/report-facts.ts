import type {CaseSection,ReportSource} from './report-domain';
import type {QuantityObservation} from './domain';
const metricSection:Record<QuantityObservation['metric'],CaseSection['key']>={pack_contents:'offering',units_per_order:'buyers',displayed_sales:'volume',review_count:'volume',repeat_mention:'value'};
export function attachBusinessFacts(sections:CaseSection[],sources:ReportSource[]):CaseSection[]{
 return sections.map(section=>{
  const facts=sources.flatMap(source=>source.quantities.filter(metric=>(source.role==='comparison'?'comparison':metricSection[metric.metric])===section.key).map(metric=>({snapshotId:source.id,metricId:metric.id})));
  return {...section,observations:facts.slice(0,50),...(facts.length>50?{factCoverage:{displayed:50,available:facts.length}}:{})};
 });
}
