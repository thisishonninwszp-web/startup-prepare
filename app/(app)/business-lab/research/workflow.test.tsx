import {beforeEach,it,expect,vi} from 'vitest';
import type {ReactElement,ReactNode} from 'react';
const h=vi.hoisted(()=>({slots:[] as unknown[],index:0,effects:[] as (()=>void)[],focus:(()=>{}) as ()=>void,list:vi.fn(),get:vi.fn(),erase:vi.fn(),save:vi.fn()}));
vi.mock('react',async()=>{const actual=await vi.importActual<typeof import('react')>('react');return {...actual,useState:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;}];},useRef:(initial:unknown)=>{const i=h.index++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},useEffect:(fn:()=>void)=>{const i=h.index++;if(!(i in h.slots)){h.slots[i]=true;h.effects.push(fn);}}};});
vi.mock('./actions',()=>({loadResearchAction:h.list,loadResearchRecordAction:h.get,saveResearchAction:h.save,eraseResearchAction:h.erase,loadResearchCasesAction:vi.fn(),loadResearchSourcesAction:vi.fn()}));
import {BusinessResearchPanel} from './research-panel';
import type {ResearchRecord} from '@/lib/domains/business-teardowns/research/domain';
const record:ResearchRecord={id:'10000000-0000-4000-8000-000000000001',kind:'failure',title:'OLD_RESEARCH_TITLE',caseIds:[],experienceIds:[],payload:{whatChanged:'OLD_RESEARCH_BODY'},revision:1,createdAt:'2026-11-20',updatedAt:'2026-11-20',erasedAt:null,invalidated:false,experienceInvalidated:false,sources:[]};
const page={available:true,items:[record],nextCursor:'next-page'};
let initialKind:'failure'|'apprenticeship'='failure';
function tree(){h.index=0;const result=BusinessResearchPanel({initialState:page,initialCases:{items:[],nextCursor:null},experiences:[],initialKind,initialCaseId:'20000000-0000-4000-8000-000000000001'});h.effects.splice(0).forEach(fn=>fn());return result;}
type Element=ReactElement<Record<string,unknown>>;
function traverse(node:ReactNode):Element[]{if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(traverse);const element=node as Element;if(element.props.hidden)return [];return [element,...traverse(element.props.children as ReactNode)];}
function text(node:ReactNode):string{if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(text).join('');if(node&&typeof node==='object')return text((node as Element).props.children as ReactNode);return '';}
function nodes(){return traverse(tree());}
function button(label:string){const found=nodes().find(node=>typeof node.props.onClick==='function'&&text(node.props.children as ReactNode)===label);if(!found)throw Error(`missing ${label}`);return found.props as {onClick:()=>void;disabled?:boolean};}
function visible(){return nodes().map(node=>typeof node.type==='string'?text(node.props.children as ReactNode):'').join('');}
async function flush(){for(let n=0;n<20;n++)await Promise.resolve();tree();}
beforeEach(()=>{vi.unstubAllGlobals();initialKind='failure';h.slots=[];h.index=0;h.effects=[];vi.clearAllMocks();h.focus=()=>{};vi.stubGlobal('window',{addEventListener:(event:string,fn:()=>void)=>{if(event==='focus')h.focus=fn;},removeEventListener:()=>{}});h.list.mockResolvedValue(page);h.get.mockResolvedValue(record);h.erase.mockResolvedValue({id:record.id,revision:2});});
it('hides all cached research prose on focus even while an erasure is busy',async()=>{let finish!:(value:unknown)=>void;h.erase.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));button('删除研究').onClick();tree();h.list.mockRejectedValueOnce(Error('offline'));h.focus();expect(nodes().some(node=>node.type==='article')).toBe(false);await flush();expect(nodes().some(node=>node.type==='article')).toBe(false);finish({id:record.id,revision:2});await flush();});
it('does not resurrect a record from a stale later list after confirmed erasure',async()=>{button('删除研究').onClick();await flush();button('刷新研究列表').onClick();await flush();expect(visible()).not.toContain(record.title);});
it('does not merge an older page into a list whose focus verification failed',async()=>{tree();h.list.mockRejectedValueOnce(Error('offline'));h.focus();await flush();const more=button('继续读取研究');expect(more.disabled).toBe(true);more.onClick();await flush();expect(h.list).toHaveBeenCalledTimes(1);expect(visible()).not.toContain(record.title);});
it('replays the exact pending create body after focus hides its selected source',async()=>{
 initialKind='apprenticeship';const OriginalFormData=FormData;
 const fields={title:'独立研究',mechanism:'核对交付方式',timeBudget:'午休',cashBudget:'不追加支出',gap:'尚未做过',practice:'公开资料对照',checkNext:'查原始公告',constraintsConfirmed:'on'};
 vi.stubGlobal('FormData',class extends OriginalFormData{constructor(){super();for(const [key,value]of Object.entries(fields))this.set(key,value);}});
 const picker=nodes().find(node=>'sources'in node.props&&typeof node.props.onChange==='function')!;
 (picker.props.onChange as (value:unknown)=>void)([{key:'s1',kind:'official',id:'30000000-0000-4000-8000-000000000001',quote:'能够核对的官方原文',publicConfirmed:true}]);
 h.save.mockRejectedValueOnce(Error('acknowledgment lost')).mockResolvedValueOnce({id:record.id,revision:1});
 const submit=()=>{const form=nodes().find(node=>node.type==='form'&&typeof node.props.onSubmit==='function')!;(form.props.onSubmit as (event:unknown)=>void)({preventDefault:()=>{},currentTarget:{}});};
 const beforeRetryKey=nodes().find(node=>node.type==='form'&&typeof node.props.onSubmit==='function')?.key;submit();await flush();h.focus();await flush();
 const retry=nodes().find(node=>typeof node.props.onClick==='function'&&text(node.props.children as ReactNode)==='重试原来的保存请求');
 if(retry)(retry.props.onClick as ()=>void)();else submit();await flush();
 expect(h.save).toHaveBeenCalledTimes(2);expect(h.save.mock.calls[1][0]).toEqual(h.save.mock.calls[0][0]);
 expect(h.save.mock.calls[1][0].sources).toHaveLength(1);
 expect(nodes().find(node=>node.type==='form'&&typeof node.props.onSubmit==='function')?.key).not.toBe(beforeRetryKey);
});
