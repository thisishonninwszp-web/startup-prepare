import {it,expect} from 'vitest';
import {validateJobSettings} from './settings';
import {DEFAULT_JOB_SETTINGS} from './types';
const base={...DEFAULT_JOB_SETTINGS,expectedRevision:0,requestId:'10000000-0000-4000-8000-000000000001'};
it.each([null,undefined,'2',1.5,-1])('rejects non-integer request quotas before database or providers: %s',value=>{expect(()=>validateJobSettings({...base,httpBudget:value})).toThrow();expect(()=>validateJobSettings({...base,aiBudget:value})).toThrow();});
it('rejects malformed source configuration and string opt-ins',()=>{expect(()=>validateJobSettings({...base,autoAI:'true'})).toThrow();expect(()=>validateJobSettings({...base,sources:[{mode:null,category:'tools',priceBand:'low',businessModel:'retail'}]})).toThrow();});
