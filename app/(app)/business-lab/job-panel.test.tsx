import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./job-actions',()=>({loadBusinessJobStateAction:vi.fn(),saveBusinessJobSettingsAction:vi.fn(),prepareBusinessTodayAction:vi.fn(),loadBusinessJobHistoryAction:vi.fn()}));
import {BusinessJobPanel} from './job-panel';
import {DEFAULT_JOB_SETTINGS,type JobState} from '@/lib/domains/business-teardowns/jobs/types';
const state={available:true,settings:DEFAULT_JOB_SETTINGS,run:null,attempts:[],candidates:[],history:{excluded:[],priorMain:[],recent:[]}} as JobState;
it('shows explicit independent opt-ins and truthful quota language',()=>{const html=renderToStaticMarkup(<BusinessJobPanel initialState={state} enabled={false}/>);expect(html).toContain('07:00');expect(html).toContain('自动AI');expect(html).toContain('占用额度');expect(html).toContain('关键词');expect(html).toContain('部署开关');expect(html).not.toContain('checked=""');});
it('keeps missing schema distinct from an empty task',()=>{expect(renderToStaticMarkup(<BusinessJobPanel initialState={{...state,available:false}} enabled/>)).toContain('121');});
