'use client';

import {Button} from '@/components/ui/button';
import type {ConfirmationHistory,ConfirmationNode} from '@/lib/domains/business-teardowns/history/domain';
import {ConfirmationNodeView,confirmationIdentity} from './confirmation-history-view';
import {useConfirmationHistory} from './use-confirmation-history';

export type ConfirmationHistoryPanelProps={initialState:ConfirmationHistory;initialNode?:ConfirmationNode|null;caseId?:string};
export function ConfirmationHistoryPanel(props:ConfirmationHistoryPanelProps){
 const history=useConfirmationHistory(props),{state,selected,busy,message,trusted}=history;
 const selectedIdentity=selected?confirmationIdentity(selected):null;
 const separate=selected&&!state.items.some(node=>confirmationIdentity(node)===selectedIdentity)?selected:null;
 return <div className="min-w-0 space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-2xl text-sm leading-7 text-muted-foreground">按服务器保存时间从新到旧排列，只覆盖仍保留的计划版本与调查记录。未保留的旧版本，不根据现有文字补推。当前页没有记录，不代表没有做过调查。</p><Button type="button" variant="outline" disabled={busy} onClick={()=>void history.refresh()}>重新读取确认履历</Button></div>{message&&<p role="status" className="rounded-md border p-3 text-sm leading-7">{message}</p>}{!state.available?<p className="rounded-lg border p-5 text-sm leading-7 text-muted-foreground">确认履历暂时不可读取。请先安装数据库迁移 143；这里不会用当前计划猜测过去的版本。</p>:<>{separate&&<section className="space-y-3" aria-label="单独打开的原记录"><h2 className="font-medium">单独打开的原记录</h2><ConfirmationNodeView node={separate} planErased={history.planErased(separate)} visible={trusted.has(confirmationIdentity(separate))} selected busy={busy} onOpen={key=>void history.open(key)}/></section>}<section className="min-w-0 space-y-4" aria-label="本次读取的确认记录"><h2 className="font-medium">本次读取的确认记录</h2>{!state.items.length?<p className="text-sm leading-7 text-muted-foreground">本次读取没有记录。这里只列出仍保留的版本，不判断调查是否做过或完成。</p>:state.items.map(node=>{const identity=confirmationIdentity(node),current=selectedIdentity===identity&&selected?selected:node;return <ConfirmationNodeView key={identity} node={current} planErased={history.planErased(current)} visible={trusted.has(identity)} selected={selectedIdentity===identity} busy={busy} onOpen={key=>void history.open(key)}/>;})}</section>{state.nextCursor&&<div className="space-y-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>void history.more()}>再读 20 条</Button><p className="text-xs leading-6 text-muted-foreground">当前只显示已读取的记录；是否有其他结果，不能从这一页的缺席推断。</p></div>}</>}</div>;
}
