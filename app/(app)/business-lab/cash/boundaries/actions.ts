'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {boundaryCommand,listBoundaries,getBoundary,listBoundarySources,getBoundarySource} from '@/lib/domains/business-teardowns/boundaries/transport';
import type {BoundaryCommand} from '@/lib/domains/business-teardowns/boundaries/domain';
import {z} from 'zod';
import {cashUuid} from '@/lib/domains/business-teardowns/cash/domain';
const idInput=z.object({id:cashUuid}).strict();
async function owner(){if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('请先登录');return user.id;}
export async function boundarySaveAction(input:BoundaryCommand){return boundaryCommand(await owner(),input);}
export async function boundaryListAction(input:{before?:string;caseId?:string}={}){return listBoundaries(await owner(),input);}
export async function boundaryGetAction(input:{id:string}){return getBoundary(await owner(),idInput.parse(input).id);}
export async function boundarySourcesAction(input:{before?:string;caseId?:string}={}){return listBoundarySources(await owner(),input);}
export async function boundarySourceAction(input:{id:string}){return getBoundarySource(await owner(),idInput.parse(input).id);}
