import {beforeEach,it,expect,vi} from 'vitest';
import type {ReactElement,ReactNode} from 'react';
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effects:[] as (()=>void)[],load:vi.fn()}));
vi.mock('react',async original=>{const actual=await original<typeof import('react')>();return {...actual,useState:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?(initial as ()=>unknown)():initial;return [h.slots[i],(next:unknown)=>{h.slots[i]=typeof next==='function'?(next as (old:unknown)=>unknown)(h.slots[i]):next;}];},useRef:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},useEffect:(effect:()=>void)=>{h.effects.push(effect);}};});
vi.mock('./actions',()=>({loadCaseWorkspaceAction:h.load}));
import {BusinessWorkspacePanel} from './workspace-panel';
const id='10000000-0000-4000-8000-000000000001',caseId='10000000-0000-4000-8000-000000000002';
const item={kind:'cash' as const,id,caseId,caseTitle:'店',revision:1,updatedAt:'2026-11-17T00:00:00Z',title:'本人假设',excerpt:'本人理由',nextCheck:null,sourceAvailable:true};
const props={caseId,initialState:{available:true,items:[item],nextCursor:'next'}};
function render(){h.cursor=0;return BusinessWorkspacePanel(props);}
function els(n:ReactNode):ReactElement<Record<string,unknown>>[]{if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(els);const e=n as ReactElement<Record<string,unknown>>;return 'props' in e?[e,...els(e.props.children as ReactNode)]:[];}
const click=(tree:ReactNode)=>{(els(tree).find(e=>e.props.children==='更多保存的工作')!.props.onClick as ()=>void)();};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
beforeEach(()=>{h.slots=[];h.cursor=0;h.effects=[];h.load.mockReset();});
it('retains current work on paging failure and retries same cursor',async()=>{h.load.mockRejectedValueOnce(new Error('暂未读到'));let tree=render();click(tree);await flush();tree=render();expect(els(tree).some(e=>e.props.children==='本人假设')).toBe(true);expect(els(tree).some(e=>e.props.children==='暂未读到')).toBe(true);h.load.mockResolvedValue({available:true,items:[{...item,id:caseId,title:'第二页'}],nextCursor:null});click(tree);await flush();expect(h.load.mock.calls.map(c=>c[0])).toEqual([{caseId,before:'next'},{caseId,before:'next'}]);expect(els(render()).some(e=>e.props.children==='第二页')).toBe(true);});
it('blocks synchronous double reads and drops responses after unmount',async()=>{let release!:(v:unknown)=>void;h.load.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));const tree=render();const cleanup=h.effects[0]() as unknown as (()=>void);click(tree);click(tree);expect(h.load).toHaveBeenCalledTimes(1);cleanup();release({available:true,items:[{...item,id:caseId,title:'STALE'}],nextCursor:null});await flush();expect(els(render()).some(e=>e.props.children==='STALE')).toBe(false);});
