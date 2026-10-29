import { existsSync, readFileSync } from "node:fs";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (process.env[key]) continue;
    process.env[key] = line
      .slice(index + 1)
      .replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) {
  console.error("Schema check requires Supabase URL and service-role key.");
  process.exit(1);
}

const coreProbes = [
  ["signal_reading_preferences", "user_id,event_key,signal_id,event_label,preference,created_at,updated_at"],
  ["signal_judgment_updates", "id,user_id,judgment_id,judgment,reason,source_url,created_at"],
  ["signal_reading_sessions", "user_id,report_date,signal_ids,stopped_at"],
  ["observations", "id,user_id,raw_text,tags,created_at"],
  ["ideas", "id,user_id,status,tags,hypothesis,last_activity_at"],
  ["ai_sessions", "id,idea_id,observation_id,role,messages"],
  ["predictions", "id,idea_id,outcome,due_at,hypothesis_id,confidence"],
  ["self_hypotheses", "id,user_id,code,kind,statement,tier"],
  ["self_windows", "id,user_id,hypothesis_id,context_key,outcome,grade"],
  ["self_declarations", "id,user_id,text,stated_on"],
  ["self_body_logs", "id,user_id,logged_on,kind,movement,weight_kg,reps"],
  ["self_daily", "id,user_id,logged_on,sleep_hours"],
  ["self_encounters", "id,user_id,occurred_on,kind,counterpart,outcome"],
  ["self_resources", "id,user_id,recorded_on,runway_months,allies,weekly_free_hours"],
  ["self_traits", "id,user_id,spectrum_key,name,modifiers,status,source,library_key"],
  ["self_events", "id,user_id,occurred_at,kind,title,dedupe_key"],
  ["self_quest_sightings", "id,user_id,quest_id,week_key,tier,name"],
  ["self_deeds", "id,user_id,occurred_on,title,class_key,outcome,adopted,duration_days"],
  ["self_skill_nodes", "id,user_id,node_key,skill_key,tier,proof"],
  ["self_skill_stages", "user_id,skill_key,tier,stage_name,standard,nodes,source"],
  ["self_custom_skills", "user_id,key,name,gloss,skill_group,main,layer,requires,milestones"],
  ["trait_catalog", "key,name,family,conditions,modifiers,rarity_hint"],
  ["reality_cases", "id,user_id,messages"],
  ["reality_versions", "id,case_id,version_no,focus_session_ids"],
  [
    "reality_case_sources",
    "id,case_id,business_plan_snapshot_id,source_snapshot",
  ],
  ["customer_cases", "id,user_id,markets"],
  ["customer_proxy_versions", "id,case_id,version_no"],
  ["reflection_settings", "user_id,timezone"],
  ["retro_periods", "id,user_id,period_type,status"],
  ["bayesian_beliefs", "id,user_id,idea_id"],
  ["fermi_estimates", "id,user_id,idea_id"],
  ["reframing_sessions", "id,user_id,idea_id"],
  ["dream_cases", "id,user_id,context,scale"],
  ["dream_branches", "id,case_id,user_id,is_focused"],
  ["dream_branch_canvases", "branch_id,user_id,revision"],
  [
    "reasoning_sources",
    "id,user_id,reality_version_id,bayesian_belief_id,fermi_estimate_id,reframing_session_id,source_snapshot",
  ],
  ["reality_closures", "id,user_id,case_id,source_version_id,status,due_on"],
  ["reality_closure_events", "id,closure_id,user_id,event_type"],
  [
    "reality_focus_sessions",
    "id,user_id,case_id,version_id,anchor_type,anchor_index,status,summary,include_in_closure,include_in_next_version",
  ],
  [
    "reality_focus_messages",
    "id,session_id,user_id,role,turn_no,client_key,content",
  ],
  ["own_company_profiles", "id,user_id,display_name"],
  [
    "business_plan_imports",
    "id,user_id,profile_id,version_no,status,workbook_hash",
  ],
  [
    "business_plan_chunks",
    "id,user_id,import_id,storage_path,compressed_size,extraction_status",
  ],
  [
    "business_plan_supplier_aliases",
    "id,user_id,name_hmac,alias",
  ],
  [
    "business_plan_extractions",
    "id,user_id,import_id,chunk_id,source_refs",
  ],
  [
    "business_plan_snapshots",
    "id,user_id,import_id,summary,source_refs,delta",
  ],
  [
    "business_plan_questions",
    "id,user_id,import_id,question,answer,source_refs",
  ],
  [
    "decision_closures",
    "id,user_id,object_type,object_id,status,due_on",
  ],
  [
    "decision_closure_sources",
    "id,closure_id,user_id,source_type,source_id,snapshot",
  ],
  [
    "decision_closure_events",
    "id,closure_id,user_id,event_type,note",
  ],
];

const optionalConceptProbes = [
  ["concept_workspaces", "id,user_id,idea_id"],
  ["idea_company_facts", "id,user_id,idea_id"],
  [
    "reframing_sessions",
    "central_question_candidates,selected_question_type,selected_question",
  ],
];

const eventProbes = [
  ["signal_event_ai_jobs", "user_id,event_id,input_hash,status,lease_until"],
  ["signal_events", "id,user_id,title,scope_note,revision,client_request_id,created_at,archived_at"],
  ["signal_source_snapshots", "id,user_id,signal_id,title,source_name,source_url,published_at,captured_at,source_fetched_at,capture_scope,captured_text,payload_hash"],
  ["signal_event_memberships", "id,user_id,event_id,signal_id,snapshot_id,action,revision,client_request_id,note,occurred_from,occurred_to,occurred_precision,occurred_quote,created_at"],
  ["signal_event_research_entries", "id,user_id,event_id,kind,subject_id,payload,client_request_id,created_at"],
  ["signal_event_replays", "id,user_id,event_id,mode,cutoff,created_at"],
];
const connectedProbes = [
  ["decision_observation_tasks", "id,user_id,object_type,object_id,gap_id"],
  ["decision_observation_versions", "id,user_id,task_id,revision,config,decision_snapshot,gap_snapshot"],
  ["decision_observation_runs", "id,user_id,task_id,task_version_id,payload,snapshots"],
  ["decision_observation_gap_refs", "user_id,gap_id,run_id,request_id"],
  ["idea_experiments", "id,user_id,idea_id,gap_id,series_id,revision,objective,route,access_context"],
  ["idea_experiment_cases", "id,user_id,idea_id,experiment_id,input_origin,source_snapshot"],
  ["idea_experiment_runs", "id,user_id,idea_id,experiment_id,case_manifest,criteria_snapshot,status"],
  ["idea_experiment_results", "id,user_id,idea_id,run_id,case_id,outcome,execution_context"],
];
const connectedRpcs = [
  ["save_decision_observation_version", { p_user_id: null, p_task_id: null, p_object_id: null, p_gap_id: null, p_config: {}, p_request_id: null }],
  ["save_decision_observation_run", { p_user_id: null, p_task_id: null, p_version_id: null, p_request_id: null, p_payload: {} }],
  ["attach_observation_gap_ref", { p_user_id: null, p_gap_id: null, p_run_id: null, p_request_id: null }],
  ...["save_idea_experiment_version", "append_idea_experiment_case", "start_idea_experiment_run", "complete_idea_experiment_run", "attach_experiment_gap_ref"].map((name) => [name, { p_user_id: null, p_input: {} }]),
  ["append_idea_gap_evidence", { p_user_id: null, p_gap_id: null, p_item: {}, p_request_id: null }],
];
const companyProbes = [["company_observation_entries", "id,user_id,company_id,revision,kind,payload,request_id,created_at,content_hash"]];
const companyRpcs = [["save_company_observation", { p_user_id:null,p_company_id:null,p_request_id:null,p_kind:null,p_payload:{},p_expected_identity_id:null }]];
const eventRpcs = [
  ["claim_signal_event_ai_job", { p_user_id: null, p_event_id: null, p_input_hash: null }],
  ["create_signal_event", { p_user_id: null, p_title: null, p_scope_note: null, p_request_id: null }],
  ["revise_signal_event_member", { p_user_id: null, p_event_id: null, p_signal_id: null, p_snapshot_id: null, p_action: null, p_request_id: null }],
  ["list_signal_events", { p_user_id: null }],
  ["signal_event_timeline", { p_user_id: null, p_event_id: null }],
  ["suggest_signal_event_members", { p_user_id: null, p_event_id: null }],
  ["signal_event_links", { p_user_id: null, p_signal_ids: [] }],
  ["append_signal_event_research", { p_user_id: null, p_event_id: null, p_kind: null, p_subject_id: null, p_payload: {}, p_request_id: null }],
  ["create_signal_event_replay", { p_user_id: null, p_event_id: null, p_cutoff: null, p_mode: "archived", p_request_id: null }],
  ["read_signal_event_replay", { p_user_id: null, p_event_id: null, p_session_id: null }],
  ["guess_signal_event_replay", { p_user_id: null, p_event_id: null, p_session_id: null, p_guess: null, p_request_id: null }],
  ["advance_signal_event_replay", { p_user_id: null, p_event_id: null, p_session_id: null, p_request_id: null }],
];

async function probe([table, select]) {
  const response = await fetch(
    `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );
  if (response.ok) return null;
  const body = await response.json().catch(() => ({}));
  return `${table}: ${body.code ?? response.status} ${body.message ?? ""}`;
}

let failed = false;
if (process.argv.includes("--business-learning")) {
  const reads = [["business_learning_read",{p_user_id:null,p_case_id:null,p_before:null}],["business_method_search",{p_user_id:null,p_query:"",p_before:null}]];
  for (const [name,payload] of reads) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const body = await response.json().catch(()=>({}));
    if(response.ok || body.code!=="42501") {failed=true;console.error(`BUSINESS LEARNING RPC ERROR ${name}: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
  }
}
if (process.argv.includes("--business-jobs")) {
  for (const contract of [["business_job_settings","user_id,revision,consent_version,consent_revoked_at"], ["business_job_runs","id,user_id,local_date,status,material_status,report_status"], ["business_job_attempts","id,user_id,run_id,kind,status,usage,operation_reference"]]) {
    const error = await probe(contract); if(error){failed=true;console.error(`BUSINESS JOB SCHEMA ERROR ${error}`);}
  }
  const response = await fetch(`${baseUrl}/rest/v1/rpc/business_job_command`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify({p_user_id:null,p_operation:"state",p_input:{}})});
  const body = await response.json().catch(()=>({}));
  if(response.ok || body.code!=="42501") {failed=true;console.error(`BUSINESS JOB RPC ERROR: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
}
if (process.argv.includes("--business-reports")) {
  for (const contract of [["business_case_revisions","id,user_id,case_id,revision,material_revision,erased_at"], ["business_ai_consents","id,user_id,case_id,consumed_by_request_id,revoked_at"]]) {
    const error = await probe(contract); if(error){failed=true;console.error(`BUSINESS REPORT SCHEMA ERROR ${error}`);}
  }
  const response = await fetch(`${baseUrl}/rest/v1/rpc/business_report_command`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify({p_user_id:null,p_operation:"state",p_input:{}})});
  const body = await response.json().catch(()=>({}));
  if(response.ok || body.code!=="42501") {failed=true;console.error(`BUSINESS REPORT RPC ERROR: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
}
if (process.argv.includes("--business")) {
  for (const contract of [["business_daily_cases","id,user_id,local_date,merchant_id,state,revision"], ["business_material_snapshots","id,user_id,merchant_id,origin,content_hash"]]) {
    const error = await probe(contract); if(error){failed=true;console.error(`BUSINESS SCHEMA ERROR ${error}`);}
  }
  const reads = [
    ["business_load_today", {p_user_id:null}],
    ["business_request_receipt", {p_user_id:null,p_request_id:null,p_operation:"primary",p_user_input_hash:"0".repeat(64)}],
  ];
  for (const [name,payload] of reads) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const body = await response.json().catch(()=>({}));
    if(response.ok || body.code!=="42501") {failed=true;console.error(`BUSINESS RPC ERROR ${name}: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
  }
}
if (process.argv.includes("--longitudinal")) {
  // Protected raw tables have no direct service read grant. Probe only owner-guarded read RPCs.
  // Never use worker claim/retention/ingest as a schema probe: those endpoints intentionally mutate.
  const reads = [
    ["page_statistical_sources", {p_user_id:null,p_before:null,p_limit:1}],
    ["list_product_events", {p_user_id:null,p_after_revision:0,p_limit:1}],
    ["page_observation_scheduling", {p_user_id:null,p_before:null}],
  ];
  for (const [name,payload] of reads) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const body = await response.json().catch(()=>({}));
    if(response.ok || body.code!=="42501") {failed=true;console.error(`LONGITUDINAL RPC ERROR ${name}: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
  }
}
if (process.argv.includes("--reasoning")) {
  for (const contract of [["event_reasoning_entries", "id,user_id,event_id,revision,kind,payload"], ["event_reasoning_impacts", "id,user_id,event_id,correction_id,subject_id,old_conclusion"]]) {
    const error = await probe(contract); if (error) { failed=true; console.error(`REASONING SCHEMA ERROR ${error}`); }
  }
  // Attention raw tables intentionally deny direct service-role reads so titleless RPCs are mandatory.
  const rpcs = [
    ["append_event_reasoning", {p_user_id:null,p_event_id:null,p_kind:null,p_payload:{},p_request_id:null,p_expected_revision:0}],
    ["list_event_reasoning", {p_user_id:null,p_event_id:null,p_after_revision:0,p_after_impact_revision:0,p_limit:20}],
    ["save_reading_attention", {p_user_id:null,p_event_id:null,p_kind:null,p_version_id:null,p_payload:{},p_request_id:null}],
    ["page_reading_attention", {p_user_id:null,p_event_id:null,p_after:null,p_samples_only:false,p_limit:20}],
  ];
  for (const [name,payload] of rpcs) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const body = await response.json().catch(()=>({}));
    if(response.ok || body.code!=="42501") {failed=true;console.error(`REASONING RPC ERROR ${name}: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
  }
}
if (process.argv.includes("--feedback")) {
  const tables = [
    ["decision_feedback", "id,user_id,idea_id,revision,source_kind,source_note"],
    ["decision_feedback_links", "id,user_id,feedback_id,target_idea_id,revision,action"],
    ["idea_reconsideration_entries", "id,user_id,idea_id,kind,revision,condition_version_id,cue_id,outcome"],
    ["idea_reconsideration_requests", "user_id,request_id"],
    ["feedback_task_proposals", "id,user_id,feedback_id,task_id,base_version_id,source_link_id"],
    ["feedback_task_applications", "id,user_id,proposal_id,new_task_version_id"],
    ["feedback_task_requests", "user_id,request_id,proposal_id,application_id"],
  ];
  for (const contract of tables) { const error = await probe(contract); if (error) { failed = true; console.error(`FEEDBACK SCHEMA ERROR ${error}`); } }
  const rpcs = [
    ["save_decision_feedback", {p_user_id:null,p_payload:{}}],
    ["save_decision_feedback_link", {p_user_id:null,p_payload:{}}],
    ["list_decision_feedback", {p_user_id:null,p_idea_id:null,p_before:null}],
    ["save_idea_reconsideration", {p_user_id:null,p_idea_id:null,p_request_id:null,p_kind:null,p_expected_version_id:null,p_payload:{}}],
    ["list_idea_reconsideration_cues", {p_user_id:null,p_before_revision:null}],
    ["save_feedback_task_proposal", {p_user_id:null,p_feedback_id:null,p_task_id:null,p_base_version_id:null,p_next_config:{},p_reason:null,p_request_id:null}],
    ["apply_feedback_task_proposal", {p_user_id:null,p_proposal_id:null,p_request_id:null}],
  ];
  for (const [name,payload] of rpcs) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const body = await response.json().catch(()=>({}));
    if(response.ok || body.code!=="42501") {failed=true;console.error(`FEEDBACK RPC ERROR ${name}: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
  }
}
if (process.argv.includes("--companies")) {
  for (const contract of companyProbes) {
    const error = await probe(contract);
    if (error) { failed = true; console.error(`COMPANY SCHEMA ERROR ${error}`); }
  }
  for (const [name,payload] of companyRpcs) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, { method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload) });
    const body = await response.json().catch(()=>({}));
    if(response.ok||body.code!=="42501"||body.message!=="company owner required") {failed=true;console.error(`COMPANY RPC ERROR ${name}: ${body.code??response.status} ${body.message??"owner guard absent"}`);}
  }
}
if (process.argv.includes("--connected")) {
  for (const contract of connectedProbes) {
    const error = await probe(contract);
    if (error) { failed = true; console.error(`CONNECTED SCHEMA ERROR ${error}`); }
  }
  for (const [name, payload] of connectedRpcs) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (response.ok || body.code !== "42501" || !/^(observation|experiment) owner required$/.test(body.message ?? "")) {
      failed = true; console.error(`CONNECTED RPC ERROR ${name}: ${body.code ?? response.status} ${body.message ?? "owner guard absent"}`);
    }
  }
}
if (process.argv.includes("--events")) {
  for (const contract of eventProbes) {
    const error = await probe(contract);
    if (error) { failed = true; console.error(`EVENT SCHEMA ERROR ${error}`); }
  }
  for (const [name, payload] of eventRpcs) {
    // A null owner must be rejected before any query or mutation, even with service role.
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (response.ok || body.code !== "42501" || body.message !== "event owner required") {
      failed = true; console.error(`EVENT RPC ERROR ${name}: ${body.code ?? response.status} ${body.message ?? "owner guard absent"}`);
    }
  }
}
for (const contract of coreProbes) {
  const error = await probe(contract);
  if (!error) continue;
  failed = true;
  console.error(`CORE SCHEMA ERROR ${error}`);
}

const conceptErrors = [];
for (const contract of optionalConceptProbes) {
  const error = await probe(contract);
  if (error) conceptErrors.push(error);
}
if (conceptErrors.length) {
  console.warn(
    "OPTIONAL CONCEPT SCHEMA UNAVAILABLE; related UI will remain disabled."
  );
  conceptErrors.forEach((error) => console.warn(`  ${error}`));
} else {
  console.log("Optional concept schema is available.");
}

if (failed) process.exit(1);
console.log(`Core Supabase schema contract passed (${coreProbes.length} probes).`);
