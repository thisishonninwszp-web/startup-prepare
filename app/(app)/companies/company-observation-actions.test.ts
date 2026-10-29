import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({getUser:vi.fn(),saveActivity:vi.fn()}));vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:m.getUser}})}));vi.mock('@/lib/domains/observations/companies/commands',()=>({saveActivity:m.saveActivity}));vi.mock('@/lib/domains/observations/companies/queries',()=>({}));
import {saveCompanyActivity} from './company-observation-actions';
beforeEach(()=>{process.env.COMPANY_OBSERVATIONS_ENABLED='true';m.getUser.mockResolvedValue({data:{user:{id:'owner'}}});m.saveActivity.mockReset();});
it('retains saved success when no refresh is performed by mutation',async()=>{m.saveActivity.mockResolvedValue({id:'saved'});expect(await saveCompanyActivity({companyId:'c',requestId:'r',activity:{} as never})).toEqual({ok:true,id:'saved'});expect(m.saveActivity.mock.calls[0][0]).toBe('owner');});
it('default-off rejects writes before command',async()=>{delete process.env.COMPANY_OBSERVATIONS_ENABLED;expect((await saveCompanyActivity({companyId:'c',requestId:'r',activity:{} as never})).ok).toBe(false);expect(m.saveActivity).not.toHaveBeenCalled();});
