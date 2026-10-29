import { describe, expect, it, vi } from "vitest";
import { previewCompanyProvider, previewEdinetDocument, PROVIDER_MAX_BYTES } from "./providers";
import { parseNtaIdentity } from "./identity";
import { parseCompanyProviderImport } from "./provider-imports";

const number = "1234567890123";
const xml = `<?xml version="1.0" encoding="UTF-8"?><corporations><count>1</count><corporation><corporateNumber>${number}</corporateNumber><name>合同会社 A &amp; B</name><prefectureName>東京都</prefectureName><cityName>新宿区</cityName><streetNumber>一丁目</streetNumber></corporation></corporations>`;
const manual = { corporateNumber:number, legalName:"合同会社A", address:"東京都", sourceUrl:"https://example.org/report", coverage:"2025年度 公開調達のみ", records:[{kind:"procurement",title:"試験契約",amount:0,currency:"JPY",date:null,publisher:null,rawExcerpt:"契約金額0円"}] };

describe("company official providers", () => {
  it("does not fetch without credentials", async () => {
    const fetcher = vi.fn();
    const result = await previewCompanyProvider({provider:"nta",corporateNumber:number}, {env:{},fetcher});
    expect(result.state).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads NTA official fields and entities, with exact number proof", () => {
    expect(parseNtaIdentity(xml,number)).toMatchObject({corporateNumber:number,legalName:"合同会社 A & B",address:"東京都新宿区一丁目"});
    expect(() => parseNtaIdentity(xml,"9999999999999")).toThrow();
  });
  it("rejects external entity declarations and ambiguous results", () => {
    expect(() => parseNtaIdentity(`<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///secret'>]>${xml}`,number)).toThrow();
    expect(() => parseNtaIdentity(xml.replace("</corporations>",xml.match(/<corporation>[\s\S]*<\/corporation>/)![0]+"</corporations>"),number)).toThrow();
  });
  it("uses fixed host, no redirect, and never returns the credential URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(xml));
    const result = await previewCompanyProvider({provider:"nta",corporateNumber:number}, {env:{NTA_APPLICATION_ID:"private-secret"},fetcher});
    expect(result.state).toBe("ready");
    expect(fetcher.mock.calls[0][0].origin).toBe("https://api.houjin-bangou.nta.go.jp");
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });
  it("rejects redirects and masks fetch errors", async () => {
    const deps = {env:{GBIZ_API_TOKEN:"private-secret"},fetcher:vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:"https://evil.test"}}))};
    expect((await previewCompanyProvider({provider:"gbiz",corporateNumber:number},deps)).state).toBe("error");
    expect(deps.fetcher).toHaveBeenCalledTimes(1);
    deps.fetcher.mockRejectedValue(new Error("private-secret"));
    expect(JSON.stringify(await previewCompanyProvider({provider:"gbiz",corporateNumber:number},deps))).not.toContain("private-secret");
  });
  it("rejects oversized streams even with absent content length", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("x".repeat(PROVIDER_MAX_BYTES+1)));
    expect((await previewCompanyProvider({provider:"nta",corporateNumber:number},{env:{NTA_APPLICATION_ID:"key"},fetcher})).state).toBe("error");
  });
  it("parses gbiz identity and distinguishes zero from missing money", async () => {
    const payload = {"hojin-infos":[{corporate_number:number,name:"合同会社A",location:"東京都",procurement:[{title:"ゼロ",amount:0},{title:"不明"}]}]};
    const result = await previewCompanyProvider({provider:"gbiz",corporateNumber:number,kind:"procurement"},{env:{GBIZ_API_TOKEN:"key"},fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))});
    expect(result.state).toBe("ready");
    expect(result.records.map(r=>r.amount)).toEqual([0,null]);
    expect(result.records.map(r=>r.currency)).toEqual([null,null]);
  });
  it("does not turn missing or malformed gbiz fields into empty data", async () => {
    for (const payload of [{"hojin-infos":[{corporate_number:number,name:"A"}]},{"hojin-infos":[{corporate_number:"9999999999999",name:"A",procurement:[]}]}]) {
      expect((await previewCompanyProvider({provider:"gbiz",corporateNumber:number,kind:"procurement"},{env:{GBIZ_API_TOKEN:"key"},fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))})).state).toBe("error");
    }
  });
  it("keeps descriptive subsidy amounts as unknown and retains source text", async () => {
    const payload = {"hojin-infos":[{corporate_number:number,subsidy:[{title:"研究",amount:"上限100万円",date_of_approval:"2025-04-01",government_departments:"試験省"}]}]};
    const result = await previewCompanyProvider({provider:"gbiz",corporateNumber:number,kind:"subsidy"},{env:{GBIZ_API_TOKEN:"secret"},fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))});
    expect(result.records[0]).toMatchObject({amount:null,currency:null,date:"2025-04-01",publisher:"試験省"});
    expect(result.records[0].rawExcerpt).toContain("上限100万円");
  });
  it("labels empty returned arrays and truncation without claiming no demand", async () => {
    for (const length of [0,101]) {
      const payload = {"hojin-infos":[{corporate_number:number,procurement:Array.from({length},()=>({title:"契約"}))}]};
      const result = await previewCompanyProvider({provider:"gbiz",corporateNumber:number,kind:"procurement"},{env:{GBIZ_API_TOKEN:"secret"},fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))});
      expect(result.state).toBe("ready");
      expect(result.truncated).toBe(length>100);
      expect(result.records).toHaveLength(Math.min(length,100));
      expect(result.coverage).toContain("空记录不代表无需求");
    }
  });
  it("rejects application errors or corrupt optional fields instead of inventing values", async () => {
    for (const payload of [{errors:[{message:"denied"}],"hojin-infos":[{corporate_number:number,procurement:[]}]},{"hojin-infos":[{corporate_number:number,procurement:[{title:"A",amount:-5}]}]},{"hojin-infos":[{corporate_number:number,procurement:[{title:"A",amount:"500"}]}]}]) {
      expect((await previewCompanyProvider({provider:"gbiz",corporateNumber:number,kind:"procurement"},{env:{GBIZ_API_TOKEN:"secret"},fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))})).state).toBe("error");
    }
  });
  it("does not fetch invalid private search text", async () => {
    const fetcher=vi.fn();
    expect((await previewCompanyProvider({provider:"nta",corporateNumber:"private company note"},{env:{NTA_APPLICATION_ID:"secret"},fetcher})).state).toBe("error");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns bounded valid JSON excerpts and marks omitted source material", async () => {
    const payload = {"hojin-infos":[{corporate_number:number,procurement:Array.from({length:20},()=>({title:"契約",note:"a".repeat(7000)}))}]};
    const result = await previewCompanyProvider({provider:"gbiz",corporateNumber:number,kind:"procurement"},{env:{GBIZ_API_TOKEN:"secret"},fetcher:vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))});
    expect(result.state).toBe("ready");
    expect(result.rawExcerpt.length).toBeLessThanOrEqual(80000);
    expect(result.truncated).toBe(true);
    expect(()=>JSON.parse(result.rawExcerpt)).not.toThrow();
    for (const record of result.records) {
      expect(record.rawExcerpt.length).toBeLessThanOrEqual(18000);
      expect(result.rawExcerpt).toContain(record.rawExcerpt);
    }
  });
  it("keeps EDINET online lookup explicitly unavailable without corporate proof", async () => {
    const fetcher=vi.fn();
    const result=await previewEdinetDocument({corporateNumber:number,documentId:"S100TEST"},{env:{EDINET_API_KEY:"secret"},fetcher});
    expect(result.state).toBe("unavailable");
    expect(result.message).toContain("法人番号");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds and labels manual imports without claiming online verification", () => {
    const result = parseCompanyProviderImport(JSON.stringify(manual),number);
    expect(result).toMatchObject({state:"ready",sourceType:"user_imported",records:[{amount:0}]});
    expect(() => parseCompanyProviderImport(JSON.stringify({...manual,corporateNumber:"9999999999999"}),number)).toThrow();
    expect(() => parseCompanyProviderImport(JSON.stringify({...manual,coverage:""}),number)).toThrow();
    expect(() => parseCompanyProviderImport(JSON.stringify({...manual,records:Array(101).fill(manual.records[0])}),number)).toThrow();
  });
  it("preserves literal manual quotes even when JSON escapes line breaks", () => {
    const record={...manual.records[0],rawExcerpt:"引用第一行\n引用第二行"};
    const result=parseCompanyProviderImport(JSON.stringify({...manual,records:[record]}),number);
    expect(result.rawExcerpt).toContain(record.rawExcerpt);
  });
});
