import {vi,it,expect,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),save:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>({auth:{getUser:m.user}})}));vi.mock('@/lib/domains/observations/scheduling/commands',()=>({saveSchedule:m.save}));vi.mock('@/lib/domains/observations/scheduling/queries',()=>({loadScheduling:m.load}));
import {loadSchedulingAction,saveScheduleAction} from './scheduling-actions';
beforeEach(()=>{vi.clearAllMocks();process.env.SCHEDULED_OBSERVATIONS_ENABLED='true';process.env.STATISTICAL_DENOMINATORS_ENABLED='true';m.user.mockResolvedValue({data:{user:{id:'owner'}},error:null});});
it('gates schedules on both explicit feature flags',async()=>{process.env.STATISTICAL_DENOMINATORS_ENABLED='false';await expect(loadSchedulingAction()).rejects.toThrow();expect(m.load).not.toHaveBeenCalled();});
it('derives owner from auth and propagates reads for post-save refresh failures',async()=>{m.load.mockRejectedValue(new Error('refresh failed'));await expect(loadSchedulingAction()).rejects.toThrow('refresh failed');expect(m.load).toHaveBeenCalledWith('owner',undefined);});
it('returns persisted result without performing unrelated idea actions',async()=>{m.save.mockResolvedValue({id:'saved'});expect(await saveScheduleAction({configId:'config',requestId:'req',enabled:false,intervalMinutes:60,dailyBudget:2})).toMatchObject({ok:true,data:{id:'saved'}});expect(m.save).toHaveBeenCalledWith('owner',expect.objectContaining({enabled:false}));});
