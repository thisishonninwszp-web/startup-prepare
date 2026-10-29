import type {BusinessCandidate} from './providers/rakuten';
export const RULE_VERSION='business-rotation-v1';
export const AUTO_POLICY_VERSION='official-rakuten-scalars-v1';
export type RotationDimensions={category:string;priceBand:string;businessModel:string};
export type QueuedCandidate=BusinessCandidate&RotationDimensions&{sourcePage:number;capturedAt:string};
export type SelectionHistory={excluded:string[];priorMain:string[];recent:RotationDimensions[]};
export function merchantKey(candidate:BusinessCandidate):string{return `${candidate.merchant.platform}:${candidate.merchant.platformShopId}`;}
export function admissible(candidate:QueuedCandidate):boolean {
 const m=candidate.merchant;
 try {const item=new URL(candidate.itemUrl),shop=new URL(m.sourceUrl);return m.platform==='rakuten'&&m.identityScope==='platform_shop_id'&&/^[\w-]+$/.test(m.platformShopId)&&candidate.itemCode.startsWith(`${m.platformShopId}:`)&&candidate.itemCode.length>m.platformShopId.length+1&&Boolean(m.name&&candidate.itemName&&candidate.coverage&&candidate.category&&candidate.priceBand&&candidate.businessModel)&&item.protocol==='https:'&&item.hostname==='item.rakuten.co.jp'&&item.pathname.split('/')[1]===m.platformShopId&&shop.protocol==='https:'&&shop.hostname==='www.rakuten.co.jp'&&shop.pathname.split('/')[1]===m.platformShopId&&!item.username&&!shop.username&&!item.password&&!shop.password&&Number.isInteger(candidate.sourcePage)&&candidate.sourcePage>0&&Number.isFinite(Date.parse(candidate.capturedAt));}catch{return false;}
}
