import {describe,it,expect} from 'vitest';
import {parsePressureQuestions} from './domain';
const plan={caseId:'10000000-0000-4000-8000-000000000001',scenarioKey:'prepay' as const,changedCondition:'假设条件',action:'暂停采购',tradeoff:'我承担代价',checkNext:'核对条款'};
describe('pressure response and retry regressions',()=>{
 it('rejects invented quantities written in Chinese',()=>{expect(()=>parsePressureQuestions(JSON.stringify({questions:[{question:'你如何保证三成利润？',answerQuote:plan.action}]}),plan)).toThrow();});
 it('rejects unsupported factual prose even when it quotes a real answer',()=>{expect(()=>parsePressureQuestions(JSON.stringify({questions:[{question:'顾客每天排队付款，你为什么不立即扩张？',answerQuote:plan.action}]}),plan)).toThrow();});
 it('requires exact own quotes even for a valid angle and rejects additional free prose',()=>{for(const q of [{questionKey:'premise',answerQuote:'并没有写下这句话'},{questionKey:'cost',answerQuote:plan.action,question:'顾客每天排队付款，你为什么不扩张？'},{questionKey:'invented',answerQuote:plan.action}])expect(()=>parsePressureQuestions(JSON.stringify({questions:[q]}),plan)).toThrow();});
});
