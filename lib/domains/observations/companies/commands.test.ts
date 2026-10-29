import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabaseAdmin:{rpc:mocks.rpc}}));
import {saveActivity,confirmIdentity,linkSavedJob} from './commands';
beforeEach(()=>{mocks.rpc.mockReset();mocks.rpc.mockResolvedValue({data:{id:'saved'},error:null});});
const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';const source={kind:'manual_import' as const,url:null,rawText:'exact',quote:'exact',scope:'one'};
describe('company commands',()=>{it('validates quote before RPC',async()=>{await expect(saveActivity(id,{companyId:id,requestId:id,activity:{type:'manual',stage:'action',title:'x',occurredOn:null,dateUnknown:true,details:{},source:{...source,quote:'fake'}}})).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();});it('sends expected identity for atomic compare',async()=>{await confirmIdentity(id,{companyId:id,requestId:id,expectedIdentityId:null,identity:{corporateNumber:'1234567890123',legalName:'Name',address:'Tokyo',source}});expect(mocks.rpc.mock.calls[0][1].p_expected_identity_id).toBe(null);});it('copies saved jobs server-side without accepting body',async()=>{await linkSavedJob(id,{companyId:id,requestId:id,jobId:id,confirmCandidate:true,previewHash:'a'.repeat(64)});expect(mocks.rpc.mock.calls[0][1].p_payload).toEqual({jobId:id,confirmCandidate:true,previewHash:'a'.repeat(64)});});});

