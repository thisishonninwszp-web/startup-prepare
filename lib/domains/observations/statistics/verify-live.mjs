import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const match=readFileSync('.env.local','utf8').match(/^ESTAT_APP_ID\s*=\s*(.+)$/m);
const key=match?.[1].trim().replace(/^['"]|['"]$/g,'');
if(!key){process.stdout.write('credential_unavailable\n');process.exit(1);}
const dir='lib/domains/observations/statistics/fixtures';mkdirSync(dir,{recursive:true});
const kind=process.argv[2]??'getMetaInfo';
const params=new URLSearchParams({appId:key,statsDataId:'0004006264',lang:'J',explanationGetFlg:'Y'});
if(kind==='getStatsData'){
 const meta=JSON.parse(readFileSync(`${dir}/estat-metadata.live.json`,'utf8')).GET_META_INFO.METADATA_INF;
 const list=meta.CLASS_INF.CLASS_OBJ;
 const dims=Array.isArray(list)?list:[list];
 for(const dim of dims){const cats=Array.isArray(dim.CLASS)?dim.CLASS:[dim.CLASS];const cat=dim['@id']==='cat01'&&process.argv[3]==='hotel'?cats.find(c=>c['@name']==='旅館，ホテル'):cats[0];if(!cat)throw new Error('category_unavailable');const id=dim['@id'];const param=id==='tab'?'cdTab':id==='time'?'cdTime':id==='area'?'cdArea':`cd${id[0].toUpperCase()}${id.slice(1)}`;params.set(param,cat['@code']);}
 params.set('limit','1');params.set('startPosition','1');params.set('metaGetFlg','Y');params.set('cntGetFlg','N');
}
try{
 const response=await fetch(`https://api.e-stat.go.jp/rest/3.0/app/json/${kind}?${params}`,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('http');
 let raw=await response.text();if(raw.length>3000000)throw new Error('size');
 raw=raw.split(key).join('[REDACTED]');
 const value=JSON.parse(raw);const root=value[kind==='getMetaInfo'?'GET_META_INFO':'GET_STATS_DATA'];
 // PARAMETER may echo appId; omit the entire request wrapper.
 delete root.PARAMETER;
 if(String(root.RESULT?.STATUS)!=='0'){process.stdout.write('official_api_rejected\n');process.exit(1);}
 writeFileSync(`${dir}/${kind==='getMetaInfo'?'estat-metadata':process.argv[3]==='hotel'?'estat-hotel-cell':'estat-cell'}.live.json`,JSON.stringify(value,null,2));
 process.stdout.write(JSON.stringify({kind,status:root.RESULT.STATUS,bytes:raw.length,tableId:'0004006264',fetchedAt:new Date().toISOString(),dimensions:kind==='getMetaInfo'?root.METADATA_INF.CLASS_INF.CLASS_OBJ.map(d=>({id:d['@id'],name:d['@name'],count:Array.isArray(d.CLASS)?d.CLASS.length:1})):undefined,result:kind==='getStatsData'?root.STATISTICAL_DATA.DATA_INF:undefined})+'\n');
}catch{process.stdout.write('official_request_failed (no diagnostic URL retained)\n');process.exit(1);}
