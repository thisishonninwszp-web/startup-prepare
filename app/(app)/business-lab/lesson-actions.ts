'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {saveCaseLesson} from '@/lib/domains/business-teardowns/report-commands';
import type {LessonInput} from '@/lib/domains/business-teardowns/report-domain';
export async function saveBusinessLessonAction(input:LessonInput){if(!businessTeardownsEnabled())throw new Error('生意拆解尚未开启');const {data:{user}}=await createClient().auth.getUser();if(!user)throw new Error('未登录');return saveCaseLesson(user.id,input);}
