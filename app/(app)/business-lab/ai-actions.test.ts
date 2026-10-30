import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/domains/business-teardowns/ai-research',()=>({businessTeardownsAiEnabled:vi.fn(),researchBusinessCase:vi.fn()}));
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsAiEnabled,researchBusinessCase} from '@/lib/domains/business-teardowns/ai-research';
import {generateBusinessReportAction} from './ai-actions';
const id='11111111-1111-4111-8111-111111111111';
const input={caseId:id,requestId:id,consentId:id,materialRevision:1,expectedReportRevision:0,snapshotIds:[id],comparisonSnapshotIds:[]};
describe('business AI action',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(businessTeardownsAiEnabled).mockReturnValue(true);vi.mocked(createClient).mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'owner'}}})}} as never);});
 it('rejects when disabled before auth/read',async()=>{vi.mocked(businessTeardownsAiEnabled).mockReturnValue(false);await expect(generateBusinessReportAction(input)).rejects.toThrow('尚未开启');expect(createClient).not.toHaveBeenCalled();});
 it('requires signed in owner and validates contract before service',async()=>{vi.mocked(createClient).mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:null}})}} as never);await expect(generateBusinessReportAction(input)).rejects.toThrow('未登录');expect(researchBusinessCase).not.toHaveBeenCalled();});
 it('rejects invalid request before service',async()=>{await expect(generateBusinessReportAction({...input,snapshotIds:[]})).rejects.toThrow();expect(researchBusinessCase).not.toHaveBeenCalled();});
 it('uses authenticated owner and forwards completed receipt',async()=>{vi.mocked(researchBusinessCase).mockResolvedValue({status:'busy'});expect(await generateBusinessReportAction(input)).toEqual({status:'busy'});expect(researchBusinessCase).toHaveBeenCalledWith('owner',input);});
 it('returns an explicit uncertain result without exposing provider or private error bodies',async()=>{vi.mocked(researchBusinessCase).mockRejectedValue(new Error('private excerpt and provider secret'));const result=await generateBusinessReportAction(input);expect(result).toMatchObject({status:'unconfirmed'});expect(JSON.stringify(result)).not.toContain('private excerpt');expect(JSON.stringify(result)).toContain('重新读取');expect(researchBusinessCase).toHaveBeenCalledTimes(1);});
});
