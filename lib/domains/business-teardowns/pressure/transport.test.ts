import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),generate:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabaseAdminUncached:{rpc:mocks.rpc}}));vi.mock('@/lib/ai/business-pressure',()=>({generatePressureQuestions:mocks.generate,PressureOutputError:class extends Error{constructor(public raw:string){super('invalid');}}}));
import {requestPressureQuestions,listPressures} from './transport';
import {PressureOutputError} from '@/lib/ai/business-pressure';
const owner='10000000-0000-4000-8000-000000000001',id='10000000-0000-4000-8000-000000000002',requestId='10000000-0000-4000-8000-000000000003';
const plan={caseId:owner,scenarioKey:'prepay',changedCondition:'假设供货改预付',action:'先暂停采购',tradeoff:'我承担少接单代价',checkNext:'先问分批付款'};
const payload={casePublicName:'公开店名',hypotheticalScenario:plan.changedCondition,ownAction:plan.action,explanation:{tradeoff:plan.tradeoff,checkNext:plan.checkNext}};
const state={requestId,revision:1,status:'pending',questions:null};const input={id,requestId,expectedRevision:1,payloadPreview:JSON.stringify(payload,null,2),publicDeidentified:true as const,allowGoogleGemini:true as const};
beforeEach(()=>{mocks.rpc.mockReset();mocks.generate.mockReset();});
describe('pressure AI lease transport',()=>{
 it('does not resend an existing pending or unknown lease',async()=>{mocks.rpc.mockResolvedValue({data:{send:false,state},error:null});expect(await requestPressureQuestions(owner,input)).toEqual(state);expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledOnce();});
 it('uses the leased payload and records one unknown after a provider failure',async()=>{mocks.rpc.mockResolvedValueOnce({data:{send:true,state,payload},error:null}).mockResolvedValueOnce({data:{state:{...state,status:'unknown'}},error:null});mocks.generate.mockRejectedValue(new Error('network'));expect((await requestPressureQuestions(owner,input))?.status).toBe('unknown');expect(mocks.generate).toHaveBeenCalledOnce();expect(mocks.rpc.mock.calls[1][1].p_input).toEqual({id,requestId,status:'unknown'});});
 it('isolates malformed raw output from normal record data',async()=>{mocks.rpc.mockResolvedValueOnce({data:{send:true,state,payload},error:null}).mockResolvedValueOnce({data:{state:{...state,status:'invalid'}},error:null});mocks.generate.mockRejectedValue(new PressureOutputError('untrusted raw'));await requestPressureQuestions(owner,input);expect(mocks.rpc.mock.calls[1][1].p_input).toEqual({id,requestId,status:'invalid',raw:'untrusted raw'});});
 it('returns unavailable only for missing migration and surfaces other database failures',async()=>{mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42883',message:'missing'}});expect((await listPressures(owner)).available).toBe(false);mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42501',message:'owner'}});await expect(listPressures(owner)).rejects.toThrow('owner');});
});
