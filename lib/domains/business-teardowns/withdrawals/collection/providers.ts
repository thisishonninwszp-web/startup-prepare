import type {tavilySearch} from '@/lib/external';
// One actual POST. Blocking redirects prevents hidden, unreserved requests to another endpoint.
export const searchWithdrawalAnnouncements:typeof tavilySearch=async(query,maxResults=6,includeDomains=[])=>{
 const key=process.env.TAVILY_API_KEY;if(!key)throw new Error('搜索服务尚未配置');
 const response=await fetch('https://api.tavily.com/search',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({query,max_results:Math.min(maxResults,6),search_depth:'basic',include_answer:false,include_domains:includeDomains})});
 if(!response.ok)throw new Error('公开公告搜索未完成');
 const data:unknown=await response.json();const results=data&&typeof data==='object'&&'results'in data&&Array.isArray(data.results)?data.results:[];
 return results.slice(0,6).flatMap((entry:unknown)=>entry&&typeof entry==='object'&&'url'in entry&&typeof entry.url==='string'?[{url:entry.url,title:'',content:''}]:[]);
};
