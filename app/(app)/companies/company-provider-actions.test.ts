import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth:vi.fn(),identity:vi.fn(),provider:vi.fn(),capture:vi.fn(),confirm:vi.fn(),activity:vi.fn(),snapshot:vi.fn(),saved:vi.fn() }));
vi.mock("@/lib/supabase/server",()=>({createClient:()=>({auth:{getUser:m.auth}})}));
vi.mock("@/lib/domains/observations/companies/queries",()=>({getIdentity:m.identity,getRequestEntry:m.saved}));
vi.mock("@/lib/domains/observations/companies/commands",()=>({confirmTrustedIdentity:m.confirm,saveTrustedActivity:m.activity,saveTrustedSnapshot:m.snapshot}));
vi.mock("@/lib/domains/observations/companies/providers",()=>({previewCompanyProvider:m.provider,previewEdinetDocument:vi.fn()}));
vi.mock("@/lib/domains/signals/events/windows",()=>({checkWindow:m.capture}));
import { previewCompanyData, confirmCompanyProviderIdentity, saveCompanyProviderRecord, captureCompanyPage, saveCapturedCompanySnapshot } from "./company-provider-actions";
const companyId="22222222-2222-4222-8222-222222222222",requestId="33333333-3333-4333-8333-333333333333";
const query={provider:"gbiz" as const,corporateNumber:"1234567890123",kind:"procurement" as const};
const preview={state:"ready",provider:"gbiz",sourceType:"official_api",sourceUrl:"https://api.info.gbiz.go.jp/hojin/v2/hojin/1234567890123/procurement",corporateNumber:query.corporateNumber,legalName:"会社",address:"東京",rawExcerpt:'{"title":"原文","amount":0}',records:[{kind:"procurement",title:"原文",date:null,amount:0,currency:null,publisher:null,rawExcerpt:'{"title":"原文","amount":0}'}],coverage:"接口返回范围",truncated:false,message:""};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("COMPANY_OBSERVATIONS_ENABLED","true");m.saved.mockResolvedValue(null);m.auth.mockResolvedValue({data:{user:{id:"owner"}},error:null});m.identity.mockResolvedValue({entryId:"identity",identity:{corporateNumber:query.corporateNumber}});m.provider.mockResolvedValue(preview);m.confirm.mockResolvedValue({id:"confirmed"});m.activity.mockResolvedValue({id:"saved"});m.snapshot.mockResolvedValue({id:"snapshot"});m.capture.mockResolvedValue({status:"success",url:"https://example.com/price",checkedAt:"2026-10-26T01:00:00Z",value:"找到原文标记",hash:"hash",excerpt:"月額1000円"});});
it("re-fetches selected identity fields before confirmation and rejects changed previews",async()=>{
  const p=await previewCompanyData({companyId,query});
  m.provider.mockResolvedValue({...preview,legalName:"別会社"});
  await expect(confirmCompanyProviderIdentity({companyId,requestId,expectedIdentityId:"identity",query,expectedFingerprint:p.identityFingerprint!})).rejects.toThrow();expect(m.confirm).not.toHaveBeenCalled();
});
it("saves exact selected provider record with frozen identity and leaves unknown units unknown",async()=>{
  const p=await previewCompanyData({companyId,query});await saveCompanyProviderRecord({companyId,requestId,identityEntryId:"identity",query,recordIndex:0,expectedFingerprint:p.recordFingerprints[0]});
  expect(m.activity.mock.calls[0][1].activity).toMatchObject({type:"procurement",occurredOn:null,dateUnknown:true,details:{amount:0,currency:null,corporateNumber:query.corporateNumber,identityEntryId:"identity"}});
  expect(m.provider.mock.calls[0][0]).toEqual(query);
});
it("returns a confirmed prior write before querying the provider again after a lost response",async()=>{
  const p=await previewCompanyData({companyId,query});const input={companyId,requestId,identityEntryId:"identity",query,recordIndex:0,expectedFingerprint:p.recordFingerprints[0]};
  await saveCompanyProviderRecord(input);
  const source=m.activity.mock.calls[0][1].activity.source;
  m.saved.mockResolvedValue({id:"saved",kind:"activity",payload:{source}});m.provider.mockResolvedValue({...preview,state:"unavailable"});
  await expect(saveCompanyProviderRecord(input)).resolves.toEqual({id:"saved"});expect(m.provider).toHaveBeenCalledTimes(2);
});
it("refuses missing or changed corporate binding before saving a provider record",async()=>{
  const p=await previewCompanyData({companyId,query});m.identity.mockResolvedValue({entryId:"changed",identity:null});
  await expect(saveCompanyProviderRecord({companyId,requestId,identityEntryId:"identity",query,recordIndex:0,expectedFingerprint:p.recordFingerprints[0]})).rejects.toThrow();expect(m.activity).not.toHaveBeenCalled();
});
it("checks flag and owner before any outgoing provider request",async()=>{
  vi.stubEnv("COMPANY_OBSERVATIONS_ENABLED","false");await expect(previewCompanyData({companyId,query})).rejects.toThrow();expect(m.provider).not.toHaveBeenCalled();
});
it("does not save failed web captures or quotes absent from the actual recapture",async()=>{
  const activity={type:"price" as const,stage:"action" as const,title:"价格",occurredOn:null,dateUnknown:true,source:{kind:"manual_import" as const,url:"https://example.com/price",rawText:"fake",quote:"2000円",scope:"网页片段"},details:{subject:"Basic",valueText:"2000円",region:"JP",unit:"月",currency:"JPY"}};
  await expect(saveCapturedCompanySnapshot({companyId,requestId,url:"https://example.com/price",marker:"月額",expectedHash:"hash",activity})).rejects.toThrow();expect(m.snapshot).not.toHaveBeenCalled();
  m.capture.mockResolvedValue({status:"failed",error:"网络失败"});await expect(captureCompanyPage({companyId,url:"https://example.com/price",marker:"月額"})).resolves.toMatchObject({status:"failed"});
});
