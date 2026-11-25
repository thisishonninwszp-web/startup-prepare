'use server';
import {createClient} from '@/lib/supabase/server';
import {businessTeardownsEnabled} from '@/lib/domains/business-teardowns/daily';
import {loadActionChoiceIdeas} from '@/lib/domains/business-teardowns/action-choices/transport';
export async function loadActionChoiceIdeasAction(input:{before?:string}={}){
 if(!businessTeardownsEnabled())throw Error('生意研究尚未开启');
 const {data:{user}}=await createClient().auth.getUser();if(!user)throw Error('请先登录');
 return loadActionChoiceIdeas(user.id,input);
}
