'use server';

import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {saveResearch,eraseResearch} from '@/lib/domains/business-teardowns/research/commands';
import {listResearch,getResearch,listResearchCases,listResearchSources,listResearchExperiences} from '@/lib/domains/business-teardowns/research/queries';
import type {ResearchInput,ResearchKind,SourceKind} from '@/lib/domains/business-teardowns/research/domain';

async function owner(){
 if(!businessTeardownsEnabled())throw new Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();
 if(!user)throw new Error('请先登录');
 return user.id;
}
export async function loadResearchAction(input:{kind?:ResearchKind;before?:string}={}){return listResearch(await owner(),input);}
export async function loadResearchRecordAction(id:string){return getResearch(await owner(),id);}
export async function saveResearchAction(input:ResearchInput){return saveResearch(await owner(),input);}
export async function eraseResearchAction(input:{id:string;requestId:string}){return eraseResearch(await owner(),input);}
export async function loadResearchCasesAction(input:{before?:string}={}){return listResearchCases(await owner(),input);}
export async function loadResearchSourcesAction(input:{kind:SourceKind;search?:string;before?:string}){return listResearchSources(await owner(),input);}
export async function loadResearchExperiencesAction(){return listResearchExperiences(await owner());}
