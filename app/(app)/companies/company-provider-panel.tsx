"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectedForm, Field, value } from "@/app/(app)/workbench/connected-form";
import type { CompanyIdentityState } from "@/lib/domains/observations/companies/domain";
import { previewCompanyData, confirmCompanyProviderIdentity, saveCompanyProviderRecord, type CompanyProviderQuery } from "./company-provider-actions";

type PreviewState = Awaited<ReturnType<typeof previewCompanyData>> & { query: CompanyProviderQuery; identityAtPreview: string | null };
export function CompanyProviderPanel({ companyId, identity, onSaved }: { companyId:string; identity:CompanyIdentityState; onSaved:()=>Promise<void> }) {
  const [provider,setProvider]=useState<"nta"|"gbiz"|"manual"|"edinet">("nta");
  const [kind,setKind]=useState<"identity"|"procurement"|"subsidy">("identity");
  const [preview,setPreview]=useState<PreviewState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const lock=useRef(false);
  return <details className="rounded-md border p-3 text-xs"><summary className="cursor-pointer font-medium">官方来源与人工导入</summary><p className="mt-3 leading-6 text-muted-foreground">只按你填写的法人番号查询，不会发送私人企业笔记。缺凭证会明确提示；不会使用官方演示令牌。人工导入不冒充在线查证。</p>
    <form className="mt-3 space-y-3" onChange={()=>setPreview(null)} onSubmit={async e=>{
      e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage("");setPreview(null);
      const d=new FormData(e.currentTarget);const number=value(d,"number");
      const query:CompanyProviderQuery=provider==="manual"?{provider,corporateNumber:number,raw:value(d,"raw")}:provider==="edinet"?{provider,corporateNumber:number,documentId:value(d,"document")}: {provider,corporateNumber:number,kind:provider==="nta"?"identity":kind};
      const identityAtPreview=identity.entryId;
      try{const response=await previewCompanyData({companyId,query});setPreview({...response,query,identityAtPreview});}catch(error){setMessage(error instanceof Error?error.message:"读取未完成。");}
      finally{lock.current=false;setBusy(false);}
    }}><fieldset disabled={busy} className="space-y-3"><label className="block space-y-1"><span>来源</span><select aria-label="官方或导入来源" className="h-10 w-full rounded border bg-background px-2" value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}><option value="nta">国税厅法人番号</option><option value="gbiz">Gビズインフォ</option><option value="manual">人工结构化 JSON</option><option value="edinet">EDINET 指定披露文件</option></select></label>
      <Field name="number" label="查询法人番号" required maxLength={13} initial={identity.identity?.corporateNumber??""} />
      {provider==="gbiz"&&<label className="block space-y-1"><span>查询内容</span><select aria-label="查询内容" className="h-10 w-full rounded border bg-background px-2" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="identity">法人身份</option><option value="procurement">采购记录</option><option value="subsidy">补助记录</option></select></label>}
      {provider==="edinet"&&<><Field name="document" label="EDINET 文件 ID（S 开头）" required /><p className="leading-6 text-muted-foreground">指定文件接口返回二进制，不能直接核对法人归属。本期显示限制；披露摘录请通过人工活动记录保存。</p></>}
      {provider==="manual"&&<><Field name="raw" label="结构化 JSON 原文" multiline required maxLength={60000}/><details><summary>导入格式示例</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({corporateNumber:"填写13位法人番号",legalName:"原文中的名称",address:"原文中的地址",sourceUrl:"https://example.com/source",coverage:"资料覆盖范围，不代表全部活动",records:[{kind:"procurement",title:"项目",date:null,amount:null,currency:null,publisher:null,rawExcerpt:"实际摘录"}]},null,2)}</pre></details></>}
      <Button type="submit" size="sm" variant="outline">{busy?"正在读取……":"读取并预览来源"}</Button></fieldset></form>
    {message&&<p role="status" className="mt-2 leading-6">{message}</p>}
    {preview&&<div className="mt-4 space-y-3"><p className="leading-6">{preview.preview.message}</p><p className="text-muted-foreground">覆盖范围：{preview.preview.coverage||"没有取得资料"}{preview.preview.truncated?"；内容有截取":""}</p>
      {preview.preview.state==="ready"&&<><p className="font-medium">{preview.preview.legalName||"名称未返回"} · {preview.preview.corporateNumber}</p><p>{preview.preview.address||"地址未返回"}</p><details><summary className="cursor-pointer">核对来源字段摘录</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">{preview.preview.rawExcerpt}</pre></details>
        {preview.identityFingerprint&&<ConnectedForm key={`identity:${preview.identityFingerprint}:${preview.identityAtPreview}`} operation={`company-provider-identity:${companyId}:${preview.identityAtPreview}:${JSON.stringify(preview.query)}:${preview.identityFingerprint}`} label="核对后确认法人身份" onSaved={onSaved} submit={async(_,requestId)=>{await confirmCompanyProviderIdentity({companyId,requestId,expectedIdentityId:preview.identityAtPreview,query:preview.query,expectedFingerprint:preview.identityFingerprint!});return{ok:true};}}><p className="leading-6 text-muted-foreground">核对号码、名称与地址；不会自动合并品牌、分支和母公司。</p></ConnectedForm>}
        {preview.preview.records.length===0&&<p className="leading-6 text-muted-foreground">本次未返回活动记录，不代表企业没有活动或市场没有需求。</p>}
        {preview.preview.records.map((record,i)=><article key={`${i}:${preview.recordFingerprints[i]}`} className="space-y-2 rounded border p-3"><p className="font-medium">{record.title}</p><p>日期：{record.date||"未知"} · 金额：{record.amount===null?"未知":record.amount} · 币种：{record.currency||"未知"}</p><p className="whitespace-pre-wrap break-words">{record.rawExcerpt}</p>{preview.identityAtPreview&&identity.identity?.corporateNumber===preview.preview.corporateNumber?<ConnectedForm operation={`company-provider-record:${companyId}:${preview.identityAtPreview}:${JSON.stringify(preview.query)}:${preview.recordFingerprints[i]}`} label="确认保存这条活动" onSaved={onSaved} submit={async(_,requestId)=>{await saveCompanyProviderRecord({companyId,requestId,identityEntryId:preview.identityAtPreview!,query:preview.query,recordIndex:i,expectedFingerprint:preview.recordFingerprints[i]});return{ok:true};}}><p className="text-muted-foreground">保存的是来源记录的行动，不表示已履约、获得经营结果或存在产品购买意愿。</p></ConnectedForm>:<p className="text-muted-foreground">先确认当前企业法人身份，再重新预览这些活动。</p>}</article>)}
      </>}
    </div>}
  </details>;
}
