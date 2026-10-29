export interface ProviderIdentity { corporateNumber: string; legalName: string; address: string }

export function assertCorporateNumber(value: string): void {
  if (!/^\d{13}$/.test(value)) throw new Error("法人番号必须为13位数字");
}

// NTA v4 XML is flat within corporation. No general XML interpreter, DTD, or entity resolver.
export function parseNtaIdentity(xml: string, expected: string): ProviderIdentity {
  assertCorporateNumber(expected);
  if (xml.length > 262144 || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml)) throw new Error("不支持的法人数据格式");
  if (!/^\s*(?:<\?xml[^?]*\?>\s*)?<corporations>[\s\S]*<\/corporations>\s*$/.test(xml)) throw new Error("无效的法人数据");
  const rows = [...xml.matchAll(/<corporation>([\s\S]*?)<\/corporation>/g)];
  if (rows.length !== 1) throw new Error("法人数据为空或存在多个结果");
  const row = rows[0][1];
  const field = (name: string): string => {
    const values = [...row.matchAll(new RegExp(`<${name}>([^<]*)<\\/${name}>`, "g"))];
    if (values.length > 1) throw new Error("重复的法人字段");
    return (values[0]?.[1] ?? "").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
      const named: Record<string,string> = {amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
      if (named[entity]) return named[entity];
      const point = entity.startsWith("#x") ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
      if (!Number.isInteger(point) || point < 32 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("无效字符");
      return String.fromCodePoint(point);
    }).trim();
  };
  const corporateNumber = field("corporateNumber");
  const legalName = field("name");
  const address = field("addressOutside") || [field("prefectureName"),field("cityName"),field("streetNumber")].join("");
  if (corporateNumber !== expected || !legalName || !address || legalName.length > 2000 || address.length > 2000) throw new Error("法人番号不匹配或身份字段缺失");
  return {corporateNumber,legalName,address};
}
