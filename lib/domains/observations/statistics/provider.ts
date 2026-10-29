import {STATISTICAL_TABLE_ID,normalizeMetadata,parseStatisticsPayload,validateFilters,redactStatisticalResponse,type ApprovedStatisticalConfig,type StatisticalMetadata,type StatisticalPayload} from './domain';
export type StatisticalProviderOptions={appId?:string;fetcher?:typeof fetch;beforeRequest?:()=>Promise<void>};
const MAX_BYTES=2000000;
async function getOfficial(method:'getMetaInfo'|'getStatsData',params:Record<string,string>,options:StatisticalProviderOptions):Promise<unknown>{
 const appId=options.appId??process.env.ESTAT_APP_ID;if(!appId)throw new Error('credential_unavailable');
 const url=new URL(`https://api.e-stat.go.jp/rest/3.0/app/json/${method}`);url.search=new URLSearchParams({appId,statsDataId:STATISTICAL_TABLE_ID,lang:'J',...params}).toString();
 await options.beforeRequest?.(); // Outside the diagnostic mask: lease cancellation remains visible to the executor.
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await(options.fetcher??fetch)(url,{redirect:'manual',signal:controller.signal,cache:'no-store'});if(!response.ok||response.redirected||(response.url&&new URL(response.url).origin!==url.origin)||Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw new Error();}if(!response.body)throw new Error();const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new Error();}chunks.push(c.value);}const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}const parsed=redactStatisticalResponse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)));if(JSON.stringify(parsed).includes(appId))throw new Error();return parsed;}catch{throw new Error('provider_request_failed');}finally{clearTimeout(timer);}
}
export async function fetchStatisticalMetadata(options:StatisticalProviderOptions={}):Promise<StatisticalMetadata>{return normalizeMetadata(await getOfficial('getMetaInfo',{explanationGetFlg:'Y'},options));}
export async function runProvider(config:Pick<ApprovedStatisticalConfig,'tableId'|'filters'|'metadataHash'>,options:StatisticalProviderOptions={}):Promise<StatisticalPayload>{
 if(config.tableId!==STATISTICAL_TABLE_ID)throw new Error('wrong_statistical_table');const metadata=await fetchStatisticalMetadata(options);if(metadata.metadataHash!==config.metadataHash)throw new Error('metadata_changed');const filters=validateFilters(metadata,config.filters),params:Record<string,string>={limit:'1',startPosition:'1',metaGetFlg:'Y',cntGetFlg:'N',explanationGetFlg:'Y'};for(const[id,code]of Object.entries(filters))params[`cd${id[0].toUpperCase()}${id.slice(1)}`]=code;
 return parseStatisticsPayload(await getOfficial('getStatsData',params,options),metadata,filters);
}
