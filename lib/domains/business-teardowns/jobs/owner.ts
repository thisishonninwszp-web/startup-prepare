import {ownerEmail} from '@/lib/members';
import {supabaseAdmin} from '@/lib/supabase';

export async function businessJobOwner():Promise<string|null>{
 const email=ownerEmail();
 if(!email)return null;
 for(let page=1;;page++){
  const {data,error}=await supabaseAdmin.auth.admin.listUsers({page,perPage:100});
  if(error)throw new Error(error.message);
  const owner=data.users.find(user=>user.email?.trim().toLowerCase()===email);
  if(owner)return owner.id;
  if(data.users.length<100)throw new Error('找不到已配置的每日生意主账号');
 }
}
