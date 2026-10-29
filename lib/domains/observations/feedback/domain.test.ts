import {describe,it,expect} from 'vitest';
import {normalizeFeedback,normalizeFeedbackLink} from './domain';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('private feedback inputs',()=>{
 it('rejects invented validation source overrides',()=>{expect(()=>normalizeFeedback({ideaId:id,requestId:id,sourceKind:'validation',validationId:id,sourceNote:'invented',roleContext:'buyer',interpretation:'uncertain'})).toThrow();});
 it('keeps no reply separate from signals',()=>{const v=normalizeFeedback({ideaId:id,requestId:id,sourceKind:'no_reply',sourceNote:'',contactedAt:'2026-10-26T00:00:00Z',roleContext:'buyer',interpretation:'unknown'});expect(v.sourceKind).toBe('no_reply');expect(v.sourceNote).toBe('');});
 it('requires limitations when confirming applicability',()=>{expect(()=>normalizeFeedbackLink({feedbackId:id,targetIdeaId:id,requestId:id,expectedLinkId:null,action:'confirm',assumption:'a',scope:'s',limits:'',unknown:'u'})).toThrow();});
 it('requires actual text when declaring a verbatim contact quote',()=>{expect(()=>normalizeFeedback({ideaId:id,requestId:id,sourceKind:'manual_contact',verbatim:true,roleContext:'buyer',interpretation:'uncertain'})).toThrow();});
});
