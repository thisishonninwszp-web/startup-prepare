export function merchantIdentityFromItem(input:{platform:'rakuten';shopCode:string;itemCode:string}) {
 if(!input.shopCode||input.shopCode.trim()!==input.shopCode||!input.itemCode.startsWith(`${input.shopCode}:`)||input.itemCode.length<=input.shopCode.length+1) throw new Error('商品不属于该店铺');
 return {platform:input.platform,platformShopId:input.shopCode,key:`${input.platform}:${input.shopCode}`};
}
