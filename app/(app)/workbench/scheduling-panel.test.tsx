import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
vi.mock('./scheduling-actions',()=>({loadSchedulingAction:vi.fn(),saveScheduleAction:vi.fn()}));
import {SchedulingContent} from './scheduling-panel';
it('shows Tokyo integer budget and expired reservation meaning without zero-demand claims',()=>{
 const html=renderToStaticMarkup(<SchedulingContent state={{available:true,schedules:[],sources:[],budgets:[],runs:[],nextCursor:null}} reload={async()=>{}} />);
 expect(html).toContain('东京自然日');expect(html).toContain('租约过期');expect(html).toContain('尚未配置生产定时器');expect(html).not.toContain('零需求');
});

