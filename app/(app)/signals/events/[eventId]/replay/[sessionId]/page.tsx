import { notFound,redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readReplay } from "@/lib/domains/signals/events/replay";
import { eventsEnabled } from "../../../enabled";
import { ReplayClient } from "./replay-client";
export const dynamic="force-dynamic";
export const metadata={title:"历史材料回放",robots:{index:false,follow:false}};
export default async function ReplayPage({params}:{params:{eventId:string;sessionId:string}}) {
 if(!eventsEnabled()) notFound();
 const {data:{user},error}=await createClient().auth.getUser();
 if(error||!user) redirect("/login");
 let view;
 try { view=await readReplay(user.id,params.eventId,params.sessionId); } catch { notFound(); }
 return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-2xl font-semibold">历史材料回放</h1><ReplayClient eventId={params.eventId} initial={view}/></main>;
}
