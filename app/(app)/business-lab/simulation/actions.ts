'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {listSimulations,getSimulation,listSimulationCases,loadSimulationContext,simulationCommand} from '@/lib/domains/business-teardowns/simulation/transport';
import type {SimulationCommand} from '@/lib/domains/business-teardowns/simulation/domain';
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function simulationListAction(input:{caseId?:string;before?:string}={}){return listSimulations(await owner(),input);}
export async function simulationGetAction(id:string){return getSimulation(await owner(),id);}
export async function simulationCasesAction(input:{before?:string}={}){return listSimulationCases(await owner(),input);}
export async function simulationContextAction(caseId:string){return loadSimulationContext(await owner(),caseId);}
export async function simulationSaveAction(input:SimulationCommand){return simulationCommand(await owner(),input);}
