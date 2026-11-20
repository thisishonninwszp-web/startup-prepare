import type {ResultMethodRecord,ResultMethodSource,ResultMethodDraft} from '@/lib/domains/business-teardowns/result-methods/domain';
import {record as priorResult,body,caseId,recordId as resultId} from '../simulation/checks/results/test-fixtures';
export {body,caseId,resultId,priorResult};
export const recordId='40000000-0000-4000-8000-000000000001';
export const draft:ResultMethodDraft={method:'亲手写下的方法',scenario:'重复订单的场景',conditions:'同一付款者',failureConditions:'付款者改变时失效',unknowns:'尚未核对成本'};
export const source:ResultMethodSource={id:resultId,caseId,body,createdAt:priorResult.createdAt};
export const record:ResultMethodRecord={id:recordId,caseId,resultId,parentMethodId:null,draft,createdAt:'2026-11-19T04:00:00Z',source};
