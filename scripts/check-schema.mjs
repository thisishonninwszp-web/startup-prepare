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
  ["observations", "id,user_id,raw_text,tags,created_at"],
  ["ideas", "id,user_id,status,tags,hypothesis,last_activity_at"],
  ["ai_sessions", "id,idea_id,observation_id,role,messages"],
  ["predictions", "id,idea_id,outcome,due_at"],
  ["reality_cases", "id,user_id,messages"],
  ["reality_versions", "id,case_id,version_no"],
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
];

const optionalConceptProbes = [
  ["concept_workspaces", "id,user_id,idea_id"],
  ["idea_company_facts", "id,user_id,idea_id"],
  [
    "reframing_sessions",
    "central_question_candidates,selected_question_type,selected_question",
  ],
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
