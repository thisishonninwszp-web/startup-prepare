import { supabaseAdmin } from "@/lib/supabase";
import { validateUuid, validateText } from "./domain";
import { replayInput, type ReplayView } from "./replay-domain";
async function call(name: string, viewerId: string, eventId: string, args: Record<string, unknown>) {
  validateUuid(viewerId); validateUuid(eventId);
  const { data, error } = await supabaseAdmin.rpc(name, { p_user_id: viewerId, p_event_id: eventId, ...args });
  if (error) throw new Error(error.message);
  return data;
}
export async function createReplay(viewerId: string,eventId: string,cutoffISO: string,mode: "archived" | "recovered",requestId: string): Promise<{id:string}> {
  const input = replayInput(cutoffISO,mode);
  return call("create_signal_event_replay",viewerId,eventId,{p_cutoff:input.cutoff,p_mode:input.mode,p_request_id:validateUuid(requestId)});
}
export async function readReplay(viewerId: string,eventId: string,sessionId: string): Promise<ReplayView> {
  return call("read_signal_event_replay",viewerId,eventId,{p_session_id:validateUuid(sessionId)});
}
export async function guessReplay(viewerId: string,eventId: string,sessionId: string,guess: string,requestId: string): Promise<ReplayView> {
  return call("guess_signal_event_replay",viewerId,eventId,{p_session_id:validateUuid(sessionId),p_guess:validateText(guess,4000,true),p_request_id:validateUuid(requestId)});
}
export async function advanceReplay(viewerId: string,eventId: string,sessionId: string,requestId: string): Promise<ReplayView> {
  return call("advance_signal_event_replay",viewerId,eventId,{p_session_id:validateUuid(sessionId),p_request_id:validateUuid(requestId)});
}
