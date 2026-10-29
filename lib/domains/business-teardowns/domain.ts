export type Platform = 'rakuten' | 'xiaohongshu';
export type MaterialOrigin = 'official_api' | 'public_excerpt' | 'manual_excerpt';
export type QuantityObservation = {
 id:string; metric:'pack_contents'|'units_per_order'|'displayed_sales'|'review_count'|'repeat_mention';
 raw:string; value:number|null; relation:'eq'|'gte'|'unknown'; unit:'pieces'|'packs'|'orders'|'buyers'|'mentions'|'unknown';
 period:{from:string|null;to:string|null;label:string|null}; sampleScope:string; attribution:'platform'|'merchant'|'review_excerpt'|'user_supplied';
};
export type MaterialSnapshot = {
 id:string;merchantId:string;platform:Platform;itemId:string|null;origin:MaterialOrigin;sourceUrl:string;
 capturedAt:string;publishedAt:string|null;captureScope:'api_fields'|'excerpt'|'manual_transcription';capturedText:string|null;
 quantities:QuantityObservation[];structured:Record<string,unknown>;coverage:string;contentHash:string;
};
export type Merchant = {id:string;platform:Platform;platformShopId:string;name:string;sourceUrl:string;identityScope:'platform_shop_id'|'user_supplied_unverified'};
export type MerchantInput = Omit<Merchant,'id'>;
export type SnapshotInput = Omit<MaterialSnapshot,'id'|'merchantId'|'capturedAt'|'contentHash'>;
export type DailyCase = {id:string;localDate:string;timezone:'Asia/Tokyo';merchantId:string;state:'preparing'|'ready'|'unavailable';publishedRevisionId:string|null;failureReason:string|null;revision:number;selectionReason:string};
export type CaseMember = {role:'primary'|'product'|'comparison';snapshot:MaterialSnapshot;merchant:Merchant};
export type CaseDetail = {dailyCase:DailyCase;merchant:Merchant;members:CaseMember[]};
export function orderQuantityFrom(observations:QuantityObservation[]):QuantityObservation|null {
 const orders=observations.filter(q=>q.metric==='units_per_order'&&q.relation==='eq'&&q.value!==null);
 return orders.length===1?orders[0]:null;
}
export function uuid(value:string):void {if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('无效记录标识');}
export function requiredText(value:string,max=10000):string {if(typeof value!=='string'||!value.trim()||value.length>max) throw new Error('材料缺失或过长');return value.trim();}
