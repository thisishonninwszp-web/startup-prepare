import {beforeEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./withdrawal-panel',()=>({WithdrawalPanel:()=> <p>教材阅读</p>}));
vi.mock('@/lib/members',()=>({ownerEmail:()=> 'owner@example.test'}));
const {getUser,read,notFound}=vi.hoisted(()=>({getUser:vi.fn(),read:vi.fn(),notFound:vi.fn(()=>{throw new Error('not found');})}));
vi.mock('next/navigation',()=>({notFound}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser}})}));
vi.mock('@/lib/domains/business-teardowns/withdrawals/transport',()=>({withdrawalRead:read}));
vi.mock('@/lib/domains/business-teardowns/daily',()=>({businessTeardownsEnabled:()=>process.env.BUSINESS_TEARDOWNS_ENABLED==='true'}));
import Page from './page';
const id='10000000-0000-4000-8000-000000000001';
describe('withdrawal server page',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('offers only the main account a secondary collection settings entry',async()=>{process.env.BUSINESS_TEARDOWNS_ENABLED='true';getUser.mockResolvedValue({data:{user:{id,email:'owner@example.test'}}});read.mockResolvedValue(null);expect(renderToStaticMarkup(await Page({searchParams:{}}))).toContain('/business-lab/withdrawals/collection');getUser.mockResolvedValue({data:{user:{id,email:'other@example.test'}}});expect(renderToStaticMarkup(await Page({searchParams:{}}))).not.toContain('/business-lab/withdrawals/collection');});
 it('requires logged in owner before reads and opens an exact lesson beyond page one',async()=>{process.env.BUSINESS_TEARDOWNS_ENABLED='true';getUser.mockResolvedValueOnce({data:{user:null}});await expect(Page({searchParams:{}})).rejects.toThrow();expect(read).not.toHaveBeenCalled();getUser.mockResolvedValue({data:{user:{id}}});read.mockResolvedValue(null);await Page({searchParams:{lessonId:id}});expect(read).toHaveBeenCalledWith(id,'get',{id});});
 it('does not render cached body on failed read',async()=>{read.mockRejectedValue(new Error('unavailable'));expect(renderToStaticMarkup(await Page({searchParams:{}}))).toContain('暂时不显示缓存原文');});
});
