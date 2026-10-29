import { describe, expect, it } from "vitest";
import { availableRoutes, validateVersion } from "./domain";
import { summarizeExperimentBoundary } from "./boundaries";
describe("experiment constraints", () => {
    it("offers deterministic available routes", () => expect(availableRoutes({ publicSources: true, canRunPrototype: true, canPublishExample: false, canContactPeople: false })).toEqual(["public_check", "task_reconstruction", "prototype_test", "deferred_contact"]));
    it("retains deferred questions without resources", () => expect(availableRoutes({ publicSources: false, canRunPrototype: false, canPublishExample: false, canContactPeople: false })).toEqual(["deferred_contact"]));
    it("rejects missing criteria", () => expect(() => validateVersion({} as never)).toThrow());
    it("never turns simulated success into demand", () => { const b = summarizeExperimentBoundary({ objective: "delivery", caseOrigins: ["synthetic"], executionContexts: ["ai_simulation"], reportedOutcomes: ["pass"], hasAttributedFeedback: false }); expect(b.demandConclusion).toBe("unresolved"); expect(b.stillUnknown).toContain("真实任务适用性、痛点和付费仍未知"); });
});

const valid = {
 ideaId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',objective:'delivery' as const,route:'prototype_test' as const,
 accessContext:{publicSources:false,canRunPrototype:true,canPublishExample:false,canContactPeople:false},question:'Can this produce the output?',inputPlan:{scope:'synthetic inputs'},steps:['Run locally'],passCriterion:'Matches expected output',failCriterion:'Output differs',limits:'Selected inputs only',timeBudgetMinutes:null,costBudgetMinor:null,currency:null,deferredQuestions:['Would the task occur in practice?'],recheckOn:null,
};
it('requires predeclared criteria with otherwise valid input',()=>{expect(()=>validateVersion({...valid,passCriterion:''})).toThrow();expect(()=>validateVersion({...valid,failCriterion:''})).toThrow();expect(()=>validateVersion(valid)).not.toThrow();});
it('rejects negative or fractional currency budgets and missing currency',()=>{expect(()=>validateVersion({...valid,timeBudgetMinutes:-1})).toThrow();expect(()=>validateVersion({...valid,costBudgetMinor:1.5,currency:'JPY'})).toThrow();expect(()=>validateVersion({...valid,costBudgetMinor:100})).toThrow();expect(()=>validateVersion({...valid,costBudgetMinor:0,currency:'JPY'})).not.toThrow();});
it('rejects invalid objective, unavailable route, and long criteria',()=>{expect(()=>validateVersion({...valid,objective:'potential' as never})).toThrow();expect(()=>validateVersion({...valid,route:'direct_contact'})).toThrow();expect(()=>validateVersion({...valid,passCriterion:'x'.repeat(3001)})).toThrow();});
it('rejects impossible calendar dates instead of normalizing them',()=>{expect(()=>validateVersion({...valid,recheckOn:'2026-02-30'})).toThrow();expect(()=>validateVersion({...valid,recheckOn:'2028-02-29'})).not.toThrow();});
