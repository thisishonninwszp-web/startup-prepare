'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {ConfirmButton} from '@/components/ui/confirm-button';
import {ConnectedForm,Choice,Field,lines,value} from '../connected-form';
import {eventRequest} from '@/app/(app)/signals/events/request-id';
import {getPremiseAction,listPremisesAction,loadPremiseHistoryAction,loadPremiseNewsAction,loadTargetsAction,mutatePremiseAction} from './actions';
import type {HistoryPage,NewsPage,Premise,PremiseCommand,PremiseDetail,PremisePage,TargetPage} from '@/lib/domains/premises/domain';
import {reconcileCandidates} from '@/lib/domains/premises/cache';
import {createReadGeneration,readIfCurrent} from '@/lib/domains/premises/generation';

const message=(error:unknown)=>error instanceof Error?error.message:'读取没有完成。保留的文字还在，请重试。';
const kindLabels={idea:'想法',business_case:'生意案例',method:'本人确认的方法'} as const;
function RevisionForm({operation,label,revision,submit,onSaved,children,resetOnSuccess=false}:{operation:string;label:string;revision:number;submit:(data:FormData,requestId:string,baseRevision:number)=>ReturnType<typeof mutatePremiseAction>;onSaved:()=>Promise<void>;children:ReactNode;resetOnSuccess?:boolean}){
 const [baseRevision,setBaseRevision]=useState(revision);
 return <ConnectedForm operation={`${operation}:revision:${baseRevision}`} label={label} resetOnSuccess={resetOnSuccess} onSaved={onSaved} submit={async(data,requestId)=>{const result=await submit(data,requestId,baseRevision);if(result.ok)setBaseRevision(result.data.revision);return result;}}>
 {children}{revision!==baseRevision&&<div className="space-y-2 text-xs leading-6"><p>这条前提已有新的保存。你的文字还在；先对照刚读取的前提和核对记录，再决定是否继续。</p><Button type="button" variant="outline" size="sm" onClick={()=>setBaseRevision(revision)}>用刚读取的版本继续保存，保留输入</Button></div>}
 </ConnectedForm>;
}
function PremiseEditor({premise,onSaved}:{premise?:Premise;onSaved:()=>Promise<void>}){
 const [revision,setRevision]=useState(premise?.revision??0);
 return <ConnectedForm operation={`premise:${premise?.id??'new'}:revision:${revision}`} label={premise?'保存前提':'新建前提'} resetOnSuccess={!premise} onSaved={onSaved} submit={async(data,requestId)=>{
  const result=await mutatePremiseAction({operation:'save',id:premise?.id??requestId,requestId,expectedRevision:revision,text:value(data,'text'),invalidWhen:value(data,'invalidWhen'),keywords:lines(data,'keywords')});
  if(result.ok&&premise)setRevision(result.data.revision);return result;
 }}>
  <Field name="text" label="你依赖的前提" multiline required initial={premise?.text} maxLength={3000}/>
  <Field name="invalidWhen" label="什么现象会让它失效" multiline required initial={premise?.invalidWhen} maxLength={3000}/>
  <Field name="keywords" label="查新闻的关键词（每行一个，最多 12 个，每个最多 80 字）" multiline required initial={premise?.keywords.join('\n')} maxLength={972}/>
  <p className="text-xs text-muted-foreground">这些是你自己写的判断与解释。请不要粘贴新闻或对象原文。</p>
  {premise&&revision!==premise.revision&&<div className="space-y-2 text-xs leading-6"><p>这条前提已有新的保存。你的文字还在；先对照上方刚读取的前提，再决定是否继续。</p><Button type="button" variant="outline" size="sm" onClick={()=>setRevision(premise.revision)}>用刚读取的版本继续保存，保留输入</Button></div>}
 </ConnectedForm>;
}
type DeleteInput=Omit<Extract<PremiseCommand,{operation:'erase'}>,'requestId'>|Omit<Extract<PremiseCommand,{operation:'unlink'}>,'requestId'>;
function MutationButton({input,label,onSaved}:{input:DeleteInput;label:string;onSaved:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[saved,setSaved]=useState(false);const inFlight=useRef(false);
 return <div className="space-y-2"><ConfirmButton type="button" variant="outline" size="sm" disabled={busy||saved} onClick={async()=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setStatus('');
  try{const request=await eventRequest(`premise:${input.id}:${input.operation}`,input);const result=await mutatePremiseAction({...input,requestId:request.requestId});if(!result.ok){setStatus(result.message);return;}request.complete();setSaved(true);try{await onSaved();setStatus('已保存。');}catch{setStatus('已保存，但读取没有完成。请重新读取，勿重复保存。');}}
  catch(error){setStatus(message(error));}finally{setBusy(false);inFlight.current=false;}
 }}>{busy?'正在保存……':label}</ConfirmButton>{status&&<p role="status" className="text-xs leading-6 text-muted-foreground">{status}</p>}{saved&&<Button variant="outline" type="button" size="sm" onClick={async()=>{try{await onSaved();setStatus('已重新读取。');}catch(error){setStatus(message(error));}}}>重新读取</Button>}</div>;
}
function TargetPicker(){
 const [kind,setKind]=useState<'idea'|'business_case'|'method'>('idea'),[page,setPage]=useState<TargetPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async(more=false)=>{setBusy(true);setError('');try{const next=await loadTargetsAction(kind,more?page?.nextCursor??undefined:undefined);setPage(previous=>more&&previous?{...next,items:[...previous.items,...next.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:next);}catch(e){setError(message(e));}finally{setBusy(false);}};
 return <div className="space-y-3"><label className="block space-y-1 text-xs leading-6"><span>关联哪种对象</span><select name="targetKind" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={kind} disabled={busy} onChange={event=>{setKind(event.target.value as typeof kind);setPage(null);setError('');}}>{Object.entries(kindLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>load()}>读取可关联的对象</Button>
 {error&&<p role="alert" className="text-xs">{error}</p>}{page&&!page.available&&<p role="status" className="text-xs">请完成 125 数据库更新后再读取。</p>}
 {page?.items.length?<Choice key={kind} name="targetId" label="选择你自己的对象" options={page.items.map(target=>[target.id,target.title??'对象已不可读取'])}/>:<p className="text-xs text-muted-foreground">{page?'这里还没有可关联的对象。':'先读取，再选择对象。方法只列你亲自确认过的。'}</p>}
 {page?.nextCursor&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>load(true)}>更多对象</Button>}
 </div>;
}
function PremiseContent({detail,reload,onDeleted}:{detail:PremiseDetail;reload:()=>Promise<void>;onDeleted:()=>Promise<void>}){
 const {premise,links}=detail;
 const [news,setNews]=useState<NewsPage|null>(null),[history,setHistory]=useState<HistoryPage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sourcesRefreshing,setSourcesRefreshing]=useState(false);
 const currentNews=useRef(news),currentHistory=useRef(history),sourceGeneration=useRef(0),reviewDrafts=useRef<Record<string,string>>({});
 currentNews.current=news;currentHistory.current=history;
 useEffect(()=>{
  const hadNews=currentNews.current!==null,hadHistory=currentHistory.current!==null;
  const generation=++sourceGeneration.current;
  if(!hadNews&&!hadHistory)return;
  let active=true;setSourcesRefreshing(true);
  void Promise.allSettled([hadNews?loadPremiseNewsAction(detail.premise.id):Promise.resolve(null),hadHistory?loadPremiseHistoryAction(detail.premise.id):Promise.resolve(null)]).then(results=>{
   if(!active||sourceGeneration.current!==generation)return;
   const [newsResult,historyResult]=results;let nextNews=currentNews.current;
   if(newsResult.status==='fulfilled'&&newsResult.value)nextNews=newsResult.value;
   if(historyResult.status==='fulfilled'&&historyResult.value){setHistory(historyResult.value);nextNews=reconcileCandidates(nextNews,historyResult.value);}
   setNews(nextNews);
   const failure=results.find(result=>result.status==='rejected');
   if(failure?.status==='rejected'){setError(`刚才的保存或读取已完成，但新闻还没核实：${message(failure.reason)}。请重新读取这条前提。`);return;}
   setSourcesRefreshing(false);
  });
  return()=>{active=false;};
 },[detail]);
 const load=async(kind:'news'|'history',more=false)=>{const generation=++sourceGeneration.current;setBusy(true);setError('');try{
  if(kind==='news'){
   const next=await readIfCurrent(loadPremiseNewsAction(premise.id,more?news?.nextCursor??undefined:undefined),()=>sourceGeneration.current===generation);if(!next)return;
   setNews(previous=>{const combined=more&&previous?{...next,items:[...previous.items,...next.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:next;return currentHistory.current?reconcileCandidates(combined,currentHistory.current):combined;});
  }else{
   const next=await readIfCurrent(loadPremiseHistoryAction(premise.id,more?history?.nextCursor??undefined:undefined),()=>sourceGeneration.current===generation);if(!next)return;
   setHistory(previous=>more&&previous?{...next,items:[...previous.items,...next.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:next);setNews(previous=>reconcileCandidates(previous,next));
  }
 }catch(e){setError(message(e));}finally{setBusy(false);}};
 const reviewed=reload;
 return <section className="space-y-6 rounded-lg border bg-card p-4 sm:p-6">
 <div className="space-y-2"><h2 className="text-lg font-medium">{premise.text}</h2><p className="whitespace-pre-wrap break-words text-sm leading-7">看见这个就要重新检查：{premise.invalidWhen}</p><p className="break-words text-xs text-muted-foreground">关键词：{premise.keywords.join('、')}</p><Button variant="outline" type="button" size="sm" onClick={async()=>{try{await reload();}catch(e){setError(message(e));}}}>重新读取这条前提，保留输入</Button></div>
 <details><summary className="cursor-pointer text-sm font-medium">修改前提</summary><PremiseEditor premise={premise} onSaved={reload}/></details>
 <div className="space-y-3"><h3 className="text-base font-medium">依赖这条前提的对象</h3><p className="text-xs leading-6 text-muted-foreground">核对新闻后，逐个打开这里的对象。你来判断是否需要调整；系统不会替你改变状态。</p>{links.length===0&&<p className="text-sm">还没有关联。先写清哪件事依赖它。</p>}{links.map(link=><article key={link.id} className="space-y-2 rounded-md border p-3"><p className="text-sm">{link.target.available&&link.target.href?<Link className="text-primary underline" href={link.target.href}>{link.target.title} →</Link>:<span className="text-muted-foreground">对象已删除或不可读取</span>} <span className="text-xs text-muted-foreground">{kindLabels[link.target.kind]}</span></p><p className="whitespace-pre-wrap break-words text-sm leading-7">为什么依赖：{link.rationale}</p><MutationButton input={{operation:'unlink',id:premise.id,expectedRevision:premise.revision,linkId:link.id}} label="解除关联" onSaved={reload}/></article>)}</div>
 <details><summary className="cursor-pointer text-sm font-medium">关联一个对象，或修改关联理由</summary><RevisionForm revision={premise.revision} operation={`premise-link:${premise.id}`} label="保存关联理由" onSaved={reload} submit={async(data,requestId,baseRevision)=>mutatePremiseAction({operation:'link',requestId,id:premise.id,expectedRevision:baseRevision,targetKind:value(data,'targetKind'),targetId:value(data,'targetId'),rationale:value(data,'rationale')})}><TargetPicker/><Field name="rationale" label="它为什么依赖这条前提" multiline required maxLength={3000}/><p className="text-xs text-muted-foreground">只写你自己的理由。再次关联同一对象，会更新这句理由。</p></RevisionForm></details>
 {error&&<p role="alert" className="text-sm">{error}</p>}
 <section className="space-y-3"><h3 className="text-base font-medium">从新闻里找需要核对的变化</h3><p className="text-xs leading-6 text-muted-foreground">按标题和摘要逐字查找关键词，新的在前。相同词不代表因果，也不代表前提已经改变。这里的新闻由所有登录用户共享，不读取私人分析。</p><Button variant="outline" size="sm" disabled={busy||sourcesRefreshing} onClick={()=>load('news')}>查找可能相关的新闻</Button>{news&&!news.available&&<p role="status">请完成 125 数据库更新。</p>}{news?.available&&news.items.length===0&&<p className="text-sm">这些词还没找到新闻。你可以修改关键词后再查。</p>}{news?.items.map(item=><article key={item.id} className="space-y-2 rounded-md border p-3"><p className="text-xs text-muted-foreground">{item.lastReviewedAt?`可能相关，上次核对：${item.lastReviewedAt.slice(0,10)}`:'可能相关，尚未核对'} · {item.fetchedAt?.slice(0,10)}</p>{item.available&&!sourcesRefreshing?<><Link href={`/signals/${item.id}`} className="block break-words text-sm text-primary underline">{item.title??'新闻没有标题'} →</Link><p className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">摘要节选：{item.summary}</p></>:<p className="text-sm text-muted-foreground">{sourcesRefreshing?'新闻正在重新核实，暂不展示旧内容。':'原新闻已删除或不可读取。'}</p>}<fieldset disabled={!item.available||sourcesRefreshing} onChange={event=>{const target=event.target;if(target instanceof HTMLTextAreaElement&&target.name==='effect')reviewDrafts.current[item.id]=target.value;}}><details><summary className="cursor-pointer text-sm">用这条新闻核对</summary><RevisionForm revision={premise.revision} operation={`premise-review:${premise.id}:${item.id}`} label="保存我的核对" resetOnSuccess onSaved={async()=>{delete reviewDrafts.current[item.id];await reviewed();}} submit={async(data,requestId,baseRevision)=>mutatePremiseAction({operation:'review',requestId,id:premise.id,expectedRevision:baseRevision,newsId:item.id,effect:value(data,'effect')})}><Field name="effect" label="它如何影响这条前提（写自己的判断，不复制新闻）" multiline required initial={reviewDrafts.current[item.id]} maxLength={3000}/><p className="text-xs leading-6 text-muted-foreground">保存只说明你核对过，并不表示新闻结论属实，也不等于已接触顾客。</p></RevisionForm></details></fieldset></article>)}{news?.nextCursor&&<Button variant="outline" size="sm" disabled={busy||sourcesRefreshing} onClick={()=>load('news',true)}>更早的相关新闻</Button>}</section>
 <section className="space-y-3"><h3 className="text-base font-medium">你以前怎么核对的</h3><Button variant="outline" size="sm" disabled={busy||sourcesRefreshing} onClick={()=>load('history')}>读取核对记录</Button>{history&&!history.available&&<p role="status">请完成 125 数据库更新。</p>}{history?.available&&history.items.length===0&&<p className="text-sm">还没保存过核对。新闻相关与否，要等你亲自判断。</p>}{history?.items.map(review=><article key={review.id} className="space-y-2 rounded-md border p-3"><p className="font-mono text-xs text-muted-foreground">{review.createdAt.slice(0,10)}</p>{review.news.available&&!sourcesRefreshing?<Link href={`/signals/${review.news.id}`} className="text-sm text-primary underline">{review.news.title??'新闻没有标题'} →</Link>:<p className="text-sm text-muted-foreground">{sourcesRefreshing?'新闻正在重新核实，暂不展示旧内容。以下是你自己留下的核对。':'原新闻已删除或不可读取；以下是你自己留下的核对。'}</p>}<p className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">当时核对的前提：{review.premiseText}<br/>当时写的失效现象：{review.premiseInvalidWhen}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{review.effect}</p></article>)}{history?.nextCursor&&<Button variant="outline" size="sm" disabled={busy||sourcesRefreshing} onClick={()=>load('history',true)}>更早的核对记录</Button>}</section>
 <details><summary className="cursor-pointer text-sm text-muted-foreground">删除这条前提</summary><p className="my-3 text-xs leading-6 text-muted-foreground">将一并移除这里的关联和核对记录。关联对象仍保留。</p><MutationButton input={{operation:'erase',id:premise.id,expectedRevision:premise.revision}} label="删除前提及这里的记录" onSaved={onDeleted}/></details>
 </section>;
}
export function PremisesPanel({initialPage}:{initialPage:PremisePage|null}){
 const [page,setPage]=useState(initialPage),[detail,setDetail]=useState<PremiseDetail|null>(null),[error,setError]=useState(initialPage?'':'前提暂时没有读取完成。你可以再试一次。'),[busy,setBusy]=useState(false);
 const selected=useRef<string|null>(null),selectionGeneration=useRef(createReadGeneration()),detailGeneration=useRef(createReadGeneration()),listGeneration=useRef(createReadGeneration());
 const refreshList=async()=>{
  const generation=listGeneration.current.next();const next=await listPremisesAction();
  if(listGeneration.current.isCurrent(generation))setPage(next);
 };
 const reloadDetail=async(id:string)=>{
  if(selected.current!==id)return;
  const selection=selectionGeneration.current.current(),generation=detailGeneration.current.next();
  const isCurrent=()=>selected.current===id&&selectionGeneration.current.isCurrent(selection)&&detailGeneration.current.isCurrent(generation);
  const next=await getPremiseAction(id);if(!isCurrent())return;
  if(!next)throw new Error('这条前提已经删除或不可读取。');
  await refreshList();if(isCurrent())setDetail(next);
 };
 const open=async(id:string)=>{
  const previous=selected.current,selection=selectionGeneration.current.next(),generation=detailGeneration.current.next();selected.current=id;setBusy(true);setError('');
  const isCurrent=()=>selectionGeneration.current.isCurrent(selection)&&detailGeneration.current.isCurrent(generation);
  try{const next=await getPremiseAction(id);if(!isCurrent())return;if(!next)throw new Error('这条前提已经删除或不可读取。');setDetail(next);}
  catch(e){if(isCurrent()){selected.current=previous;setError(message(e));}}
  finally{if(selectionGeneration.current.isCurrent(selection))setBusy(false);}
 };
 const refresh=async()=>{setBusy(true);setError('');try{await refreshList();if(selected.current)await reloadDetail(selected.current);}catch(e){setError(message(e));}finally{setBusy(false);}};
 return <div className="space-y-6 leading-7">{error&&<p role="alert" className="text-sm">{error}</p>}<Button variant="outline" size="sm" disabled={busy} onClick={refresh}>重新读取前提列表</Button>{page&&!page.available&&<p role="status" className="rounded-lg border p-4 text-sm">共通前提尚未就绪。请完成 125 数据库更新，再重新读取。工作台的其他功能可以照常使用。</p>}{page?.available&&<><details className="rounded-lg border bg-card p-4"><summary className="cursor-pointer font-medium">新建前提</summary><PremiseEditor onSaved={refreshList}/></details><div className="space-y-2">{page.items.length===0&&<p className="text-sm text-muted-foreground">这里还空着。先写一条你在几件事上共同依赖的判断。</p>}{page.items.map(premise=><article key={premise.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><p className="min-w-0 flex-1 break-words text-sm">{premise.text}</p><Button variant="outline" size="sm" disabled={busy} onClick={()=>open(premise.id)}>打开前提</Button></article>)}{page.nextCursor&&<Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const generation=listGeneration.current.next();const next=await listPremisesAction(page.nextCursor??undefined);if(listGeneration.current.isCurrent(generation))setPage({...next,items:[...page.items,...next.items.filter(item=>!page.items.some(old=>old.id===item.id))]});}catch(e){setError(message(e));}finally{setBusy(false);}}}>更早的前提</Button>}</div><p className="text-xs text-muted-foreground">关键词匹配不代表前提已经改变。只有你写下核对，才会留下这次判断。</p></>}{detail&&<PremiseContent key={detail.premise.id} detail={detail} reload={async()=>{try{await reloadDetail(detail.premise.id);}catch(e){setError(message(e));throw e;}}} onDeleted={async()=>{const generation=selectionGeneration.current.current();await refreshList();if(selected.current===detail.premise.id&&selectionGeneration.current.isCurrent(generation)){selectionGeneration.current.next();selected.current=null;setDetail(null);}}}/>}</div>;
}
