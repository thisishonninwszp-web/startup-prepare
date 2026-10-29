import {it,expect} from 'vitest';
import {feedbackAppliesToIdea} from './scope';
import type {Feedback,FeedbackLink} from './domain';
const f={id:'f',user_id:'owner',idea_id:'anchor'} as Feedback;
const l={id:'l',user_id:'owner',feedback_id:'f',target_idea_id:'target',revision:1,action:'confirm'} as FeedbackLink;
it('latest retract beats older confirm regardless of history ordering',()=>{expect(feedbackAppliesToIdea(f,'target',[{...l,id:'r',revision:2,action:'retract'},l])).toBe(false);expect(feedbackAppliesToIdea(f,'anchor',[])).toBe(true);});
it('foreign owner link does not prove applicability',()=>{expect(feedbackAppliesToIdea(f,'target',[{...l,user_id:'other'}])).toBe(false);});
