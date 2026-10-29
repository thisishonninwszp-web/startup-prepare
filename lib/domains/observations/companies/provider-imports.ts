import { z } from "zod";
import { assertCorporateNumber } from "./identity";
import type { ProviderPreview } from "./providers";

const text = z.string().trim().min(1).max(2000);
const schema = z.object({
  corporateNumber:z.string().regex(/^\d{13}$/), legalName:text,address:text,
  sourceUrl:z.string().max(2048).url().refine(value => {const url=new URL(value);return url.protocol === "https:" && !url.username && !url.password && !url.hash;},"出处须为不含凭证的 HTTPS URL"),
  coverage:text,
  records:z.array(z.object({kind:z.enum(["procurement","subsidy","disclosure"]),title:text,date:z.string().max(100).nullable(),amount:z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),currency:z.string().max(20).nullable(),publisher:z.string().max(1000).nullable(),rawExcerpt:text}).strict()).max(100),
}).strict();

/** Deliberately our own import envelope, never relabel arbitrary pasted JSON as an API response. */
export function parseCompanyProviderImport(raw: string, expectedCorporateNumber: string): ProviderPreview {
  assertCorporateNumber(expectedCorporateNumber);
  if (new TextEncoder().encode(raw).byteLength > 60000) throw new Error("导入内容超过60000字节");
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("导入格式不符合要求：需法人番号、名称、地址、出处、数据范围及最多100条结构化记录");
  const data = parsed.data;
  if (data.corporateNumber !== expectedCorporateNumber) throw new Error("导入法人番号与当前身份不匹配");
  // Include decoded user excerpts, so a quote containing a line break remains traceable.
  const rawExcerpt = `${raw}\n\n[用户导入的结构化原文摘录]\n${data.records.map(record => record.rawExcerpt).join("\n")}`;
  if (rawExcerpt.length > 80000) throw new Error("导入原文及摘录合计超过80000字符");
  return {...data,state:"ready",provider:"manual",sourceType:"user_imported",rawExcerpt,truncated:false,message:"用户导入资料，尚未由官方接口在线核对。空列表不代表无需求。"};
}
