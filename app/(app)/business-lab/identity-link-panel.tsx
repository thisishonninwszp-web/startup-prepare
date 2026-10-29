'use client';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Field,value} from '../workbench/connected-form';
import type {CaseDetail} from '@/lib/domains/business-teardowns/domain';
import type {LearningDraft,LearningState} from '@/lib/domains/business-teardowns/learning-domain';
export type SaveLearning=(input:LearningDraft)=>Promise<boolean>;
export function IdentityLinkPanel({detail,state,disabled,save}:{detail:CaseDetail;state:LearningState;disabled:boolean;save:SaveLearning}){
 return <section className="space-y-3 rounded-lg border p-4 text-sm"><h3 className="font-medium">经营主体人工核对</h3><p className="text-xs leading-6 text-muted-foreground">同名不等于同一主体。请分别核对两家店的出处与依据；关联只影响未来主店选题，过去各日案例与报告保留。撤销会留下新的关系事件。</p>
 {state.duplicateCaseIds.length>0&&<div role="status" className="rounded border p-3 text-xs leading-6">已确认主体有历史重复：{state.duplicateCaseIds.map(id=><Link key={id} className="mr-3 underline" href={`/business-lab/${id}`}>核对历史案例</Link>)}</div>}
 <details><summary className="cursor-pointer text-xs">确认或撤销主体关系（版本 {state.version}）</summary><form className="mt-3 space-y-3" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);const done=await save({operation:'identity',expectedVersion:state.version,leftMerchantId:detail.merchant.id,rightMerchantId:value(f,'rightMerchantId'),leftSource:value(f,'leftSource'),rightSource:value(f,'rightSource'),reason:value(f,'reason'),confirmed:f.get('confirmed')==='on',action:value(f,'action') as 'link'|'revoke'});if(done)form.reset();}}><fieldset disabled={disabled} className="space-y-3">
 <p className="text-xs">本店：{detail.merchant.name} · {detail.merchant.platform} / {detail.merchant.platformShopId}</p>
 <label className="block space-y-1 text-xs">另一家本人已保存的店<select name="rightMerchantId" aria-label="另一家本人已保存的店" className="block h-10 w-full rounded border bg-background px-2" required defaultValue=""><option value="" disabled>明确选择已有店铺</option>{state.merchants.filter(m=>m.merchantId!==detail.merchant.id).map(m=><option key={m.merchantId} value={m.merchantId}>{m.name} · {m.platform} / {m.platformShopId}</option>)}</select></label>
 <Field name="leftSource" label="本店核对出处与证据" multiline required/><Field name="rightSource" label="另一店核对出处与证据" multiline required/><Field name="reason" label="确认或撤销理由" multiline required/>
 <label className="block text-xs">操作<select name="action" aria-label="主体关系操作" className="ml-2 h-10 rounded border bg-background px-2"><option value="link">确认同一主体</option><option value="revoke">撤销此直接关系</option></select></label>
 <label className="flex gap-2 text-xs leading-6"><input name="confirmed" type="checkbox" required/>我已分别核对两家店的材料，不以名称相似自动合并。</label><Button type="submit" variant="outline" size="sm">保存主体关系事件</Button></fieldset></form></details></section>;
}
