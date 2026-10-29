import {it,expect,vi} from 'vitest';
vi.mock('@/lib/supabase',()=>({supabaseAdmin:{}}));
import {feedbackContactBrief} from './contact-brief';
import type {Feedback} from './domain';
it('无回复接触提纲保留未知、不复制私人原话或假造验证',()=>{
 const draft=feedbackContactBrief({id:'f',source_kind:'no_reply',role_context:'运营者',interpretation:'渠道可能不合适',source_note:'私人原始笔记'} as Feedback,{id:'i',title:'问题'});
 expect(draft.scenario).toContain('无回复仍不能说明');expect(draft.scenario).toContain('最近一次实际');expect(draft.scenario).not.toContain('私人原始笔记');
});
