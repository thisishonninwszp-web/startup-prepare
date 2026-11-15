import type {HistoryPage,NewsPage} from './domain';
export function reconcileCandidates(news:NewsPage|null,history:HistoryPage):NewsPage|null{
 if(!news)return null;
 const unavailable=new Set(history.items.filter(review=>!review.news.available).map(review=>review.news.id));
 return {...news,items:news.items.map(item=>unavailable.has(item.id)?{...item,title:null,summary:null,fetchedAt:null,available:false}:item)};
}
