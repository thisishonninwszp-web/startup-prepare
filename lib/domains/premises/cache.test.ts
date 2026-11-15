import {expect,it} from 'vitest';
import {reconcileCandidates} from './cache';
import type {HistoryPage,NewsPage} from './domain';
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
it('redacts a cached candidate when a new history read says its source disappeared',()=>{
 const news:NewsPage={available:true,nextCursor:null,items:[{id,title:'Old source title',summary:'Old body',available:true,fetchedAt:'2026-11-15',lastReviewedAt:null}]};
 const history:HistoryPage={available:true,nextCursor:null,items:[{id,effect:'My own note',createdAt:'2026-11-15',premiseText:'Own premise',premiseInvalidWhen:'Own invalidation',premiseRevision:1,news:{id,title:null,summary:null,available:false,fetchedAt:null}}]};
 const next=reconcileCandidates(news,history);expect(next?.items[0]).toMatchObject({id,title:null,summary:null,available:false});expect(news.items[0].title).toBe('Old source title');
});
