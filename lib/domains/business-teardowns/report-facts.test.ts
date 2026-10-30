import {it,expect} from 'vitest';
import {attachBusinessFacts} from './report-facts';
import {SECTION_KEYS,type ReportSource} from './report-domain';
import {validateSavedBusinessReport} from './report-partial';
it('saves all derived facts from a valid multi-source selection without a post-call capacity error',()=>{
 const sections=SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['待核对']}));
 const sources=Array.from({length:30},(_,index)=>({id:`source-${index}`,role:'primary',quantities:Array.from({length:100},(_,metric)=>({id:`metric-${metric}`,metric:'review_count'}))})) as unknown as ReportSource[];
 const result=attachBusinessFacts(sections,sources);expect(result.find(section=>section.key==='volume')?.observations).toHaveLength(50);expect(result.find(section=>section.key==='volume')?.factCoverage).toEqual({displayed:50,available:3000});expect(()=>validateSavedBusinessReport({sections:result},sources)).not.toThrow();expect(new TextEncoder().encode(JSON.stringify({report:{sections:result}},null,1)).length).toBeLessThan(180000);
});
it('places saved facts by metric and source role without changing their quantity meanings',()=>{
 const sections=SECTION_KEYS.map(key=>({key,observations:[],interpretations:[],unknowns:['待核对']}));
 const sources=[{id:'primary',role:'primary',quantities:[{id:'review',metric:'review_count'},{id:'pack',metric:'pack_contents'},{id:'orders',metric:'units_per_order'}]},{id:'comparison',role:'comparison',quantities:[{id:'other-review',metric:'review_count'}]}] as ReportSource[];
 const result=attachBusinessFacts(sections,sources);expect(result.find(section=>section.key==='volume')?.observations).toEqual([{snapshotId:'primary',metricId:'review'}]);expect(result.find(section=>section.key==='buyers')?.observations).toEqual([{snapshotId:'primary',metricId:'orders'}]);expect(result.find(section=>section.key==='comparison')?.observations).toEqual([{snapshotId:'comparison',metricId:'other-review'}]);expect(result.find(section=>section.key==='offering')?.observations).toEqual([{snapshotId:'primary',metricId:'pack'}]);
});
