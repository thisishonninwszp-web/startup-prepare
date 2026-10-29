import { assertCorporateNumber, parseNtaIdentity } from "./identity";

export const PROVIDER_MAX_BYTES = 262144;
export interface ProviderRecord {
  kind: "procurement" | "subsidy" | "disclosure";
  title: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
  publisher: string | null;
  rawExcerpt: string;
}
export interface ProviderPreview {
  state: "ready" | "unavailable" | "error";
  provider: "nta" | "gbiz" | "edinet" | "manual";
  sourceType: "official_api" | "user_imported";
  sourceUrl: string;
  corporateNumber: string;
  legalName: string | null;
  address: string | null;
  rawExcerpt: string;
  records: ProviderRecord[];
  coverage: string;
  truncated: boolean;
  message: string;
}
export interface ProviderRequest { provider: "nta" | "gbiz"; corporateNumber: string; kind?: "identity" | "procurement" | "subsidy" }
export interface ProviderDependencies { env?: Record<string,string | undefined>; fetcher?: typeof fetch }

/** Fixed official endpoints only. Credentials never enter a saved source URL or a diagnostic. */
export async function previewCompanyProvider(input: ProviderRequest, deps: ProviderDependencies = {}): Promise<ProviderPreview> {
  const base: ProviderPreview = {state:"error",provider:input.provider,sourceType:"official_api",sourceUrl:"",corporateNumber:input.corporateNumber,legalName:null,address:null,rawExcerpt:"",records:[],coverage:"",truncated:false,message:"来源请求失败，未产生企业事实。"};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    assertCorporateNumber(input.corporateNumber);
    if (!["nta","gbiz"].includes(input.provider) || ![undefined,"identity","procurement","subsidy"].includes(input.kind)) return base;
    if (input.provider === "nta" && input.kind && input.kind !== "identity") return {...base,message:"国税厅仅提供法人身份核对。"};
    const env = deps.env ?? process.env;
    const credential = input.provider === "nta" ? env.NTA_APPLICATION_ID : env.GBIZ_API_TOKEN;
    const suffix = input.kind && input.kind !== "identity" ? `/${input.kind}` : "";
    base.sourceUrl = input.provider === "nta"
      ? `https://www.houjin-bangou.nta.go.jp/henkorireki-johoto.html?selHouzinNo=${input.corporateNumber}`
      : `https://api.info.gbiz.go.jp/hojin/v2/hojin/${input.corporateNumber}${suffix}`;
    base.coverage = input.provider === "nta" ? "国税厅法人番号 v4、指定番号、history=0。该服务内容不由国税厅保证。" : `Gビズインフォ v2 指定法人 ${input.kind ?? "identity"} 接口返回范围；非全市场、非完整历史。空记录不代表无需求。`;
    if (!credential) return {...base,state:"unavailable",message:"官方接口凭证未配置；可使用人工导入，不能视为已在线核对。"};
    const url = new URL(input.provider === "nta" ? "https://api.houjin-bangou.nta.go.jp/4/num" : base.sourceUrl);
    const headers: Record<string,string> = {Accept:input.provider === "nta" ? "application/xml" : "application/json"};
    if (input.provider === "nta") {
      url.search = new URLSearchParams({id:credential,number:input.corporateNumber,type:"12",history:"0"}).toString();
    } else headers["X-hojinInfo-api-token"] = credential;
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 8000);
    const response = await (deps.fetcher ?? fetch)(url,{headers,signal:controller.signal,redirect:"manual",cache:"no-store"});
    if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== url.origin)) { await response.body?.cancel(); return base; }
    if (Number(response.headers.get("content-length")) > PROVIDER_MAX_BYTES) { await response.body?.cancel(); return {...base,message:"响应超过读取上限，未保存。"}; }
    if (!response.body) return base;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > PROVIDER_MAX_BYTES) { await reader.cancel(); return {...base,message:"响应超过读取上限，未保存。"}; }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {buffer.set(chunk,offset);offset += chunk.byteLength;}
    const text = new TextDecoder("utf-8",{fatal:true}).decode(buffer);
    // Defensive redaction: an error body or echoed token must never be persisted or returned.
    if (text.includes(credential)) return base;
    if (input.provider === "nta") {
      if (text.length > 80000) return {...base,message:"法人身份响应超过保存上限，未保存。"};
      return {...base,...parseNtaIdentity(text,input.corporateNumber),state:"ready",rawExcerpt:text,message:"已获取指定番号的身份资料；需要你明确确认。"};
    }
    const payload = JSON.parse(text);
    if (!payload || !Array.isArray(payload["hojin-infos"]) || payload["hojin-infos"].length !== 1 || (Array.isArray(payload.errors) && payload.errors.length)) return base;
    const company = payload["hojin-infos"][0];
    if (!company || company.corporate_number !== input.corporateNumber) return {...base,message:"响应法人番号与请求不匹配，未保存。"};
    const legalName = typeof company.name === "string" && company.name.trim() ? company.name.trim() : null;
    const address = typeof company.location === "string" && company.location.trim() ? company.location.trim() : null;
    if ((!input.kind || input.kind === "identity") && (!legalName || !address)) return {...base,message:"响应缺少法人名称或地址，无法确认身份。"};
    const records: ProviderRecord[] = [];
    const sourceRecords: Record<string,unknown>[] = [];
    let sourceLength = 0;
    if ((legalName?.length ?? 0) > 2000 || (address?.length ?? 0) > 2000) return base;
    if (input.kind === "procurement" || input.kind === "subsidy") {
      if (!Array.isArray(company[input.kind])) return {...base,message:"来源未返回所需数据字段，不能解释为空记录。"};
      base.truncated = company[input.kind].length > 100;
      for (const item of company[input.kind].slice(0,100)) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return base;
        if (item.amount !== undefined && item.amount !== null &&
          (input.kind === "procurement"
            ? typeof item.amount !== "number" || !Number.isSafeInteger(item.amount) || item.amount < 0
            : typeof item.amount !== "string")) return {...base,message:"来源金额字段不符合官方格式，未保存。"};
        const rawExcerpt = JSON.stringify(item);
        if (rawExcerpt.length > 18000 || sourceLength + rawExcerpt.length > 60000) {base.truncated=true;continue;}
        sourceLength += rawExcerpt.length;
        sourceRecords.push(item);
        const amount = typeof item.amount === "number" && Number.isSafeInteger(item.amount) && item.amount >= 0 ? item.amount : null;
        // Subsidy amounts may be descriptive strings, not a numeric total. Keep the original.
        records.push({kind:input.kind,title:typeof item.title === "string" ? item.title : "未提供项目名",date:typeof item.date_of_order === "string" ? item.date_of_order : typeof item.date_of_approval === "string" ? item.date_of_approval : null,amount,currency:null,publisher:typeof item.government_departments === "string" ? item.government_departments : null,rawExcerpt});
      }
    }
    const rawExcerpt = JSON.stringify({corporate_number:company.corporate_number,name:legalName,location:address,...(input.kind && input.kind !== "identity" ? {[input.kind]:sourceRecords} : {})});
    base.coverage += " 保存规范化API字段摘录；不包含响应包装及未选字段。";
    if (base.truncated) base.coverage += " 已省略超出100条、单条18000字符或总摘录60000字符上限的记录，不能据此判断不存在记录。";
    return {...base,state:"ready",legalName,address,records,rawExcerpt,message:base.truncated ? "来源记录已截取，请查看数据范围及原始来源。" : records.length ? "已取得来源记录，尚未构成需求或付费证据。" : "已取得接口响应；空记录仅代表该返回范围内无记录。"};
  } catch { return base; }
  finally {if (timer) clearTimeout(timer);}
}

/** EDINET's single-document endpoint is binary; it supplies no corporate-number proof. */
export async function previewEdinetDocument(input: {corporateNumber:string;documentId:string}, deps: ProviderDependencies = {}): Promise<ProviderPreview> {
  const valid = /^\d{13}$/.test(input.corporateNumber) && /^S[0-9A-Z]{7}$/.test(input.documentId);
  return {state:valid ? "unavailable" : "error",provider:"edinet",sourceType:"official_api",corporateNumber:input.corporateNumber,legalName:null,address:null,records:[],rawExcerpt:"",truncated:false,
    sourceUrl:valid ? `https://api.edinet-fsa.go.jp/api/v2/documents/${input.documentId}` : "",
    coverage:"指定EDINET文档ID入口；未获取、解析或核对文档，未证明其属于当前法人。",
    message:!valid ? "法人番号或文档ID格式不正确。" : !(deps.env ?? process.env).EDINET_API_KEY ? "EDINET凭证未配置；请人工导入披露摘录并核对法人番号。" : "EDINET单文档接口仅提供PDF/ZIP，不能从中核对法人番号。本期保留人工披露导入路径。"};
}
