import {describe,it,expect,vi,beforeEach} from 'vitest';
const call=vi.hoisted(()=>vi.fn());vi.mock('@/lib/ai-gateway',()=>({executeAiText:call}));
import {PRESSURE_QUESTION_ANGLES} from '@/lib/domains/business-teardowns/pressure/domain';
import {generatePressureQuestions,PressureOutputError} from './business-pressure';
const plan={caseId:'10000000-0000-4000-8000-000000000001',scenarioKey:'prepay' as const,changedCondition:'假设：供货改预付',action:'先暂停采购',tradeoff:'我承担少接单的代价',checkNext:'先核对分批付款'};
beforeEach(()=>call.mockReset());
describe('Gemini targeted pressure questions',()=>{
 it('uses metadata-only gateway and the exact visible payload without report prose',async()=>{const payload={casePublicName:'公开店名',hypotheticalScenario:plan.changedCondition,ownAction:plan.action,explanation:{tradeoff:plan.tradeoff,checkNext:plan.checkNext}};const result={questions:[{question:PRESSURE_QUESTION_ANGLES.premise,answerQuote:plan.action}]};call.mockResolvedValue(JSON.stringify({questions:[{questionKey:'premise',answerQuote:plan.action}]}));expect(await generatePressureQuestions('owner','record',plan,payload)).toEqual(result);expect(call).toHaveBeenCalledOnce();const [context,request]=call.mock.calls[0];expect(context.payloadLogging).toBe('metadata_only');expect(context.outputMode).toBe('json');expect(request.contents).toBe(JSON.stringify(payload));expect(request.config.systemInstruction).toContain('不要');});
 it('separates invalid raw output and never retries the provider',async()=>{call.mockResolvedValue('{"score":9}');await expect(generatePressureQuestions('owner','record',plan,{casePublicName:'店',hypotheticalScenario:plan.changedCondition,ownAction:plan.action,explanation:{tradeoff:plan.tradeoff,checkNext:plan.checkNext}})).rejects.toBeInstanceOf(PressureOutputError);expect(call).toHaveBeenCalledOnce();});
});
