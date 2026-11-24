process.on('uncaughtException',error=>{console.error(error.message,error.code??'',error.where??'');process.exit(1)});
import {readFile} from 'node:fs/promises';
const foundation=await readFile('lib/domains/business-teardowns/withdrawals/postgres.integration.mjs','utf8');
const marker="const owner='10000000-0000-4000-8000-000000000001'";
const prefix=foundation.slice(0,foundation.indexOf(marker));
const migrations="await db.exec('alter table ideas add column created_at timestamptz not null default clock_timestamp()');for(const name of ['147_business_explanation_plans','148_business_withdrawal_research','149_business_withdrawal_collection','150_business_workspace_explanations','151_business_research_action_choices'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));\n";
for(const suite of ['reality-results','followup-checks','history','explanations']){
 const original=await readFile(`lib/domains/business-teardowns/${suite}/postgres.integration.mjs`,'utf8');
 if(!original.includes(marker))throw Error('Legacy fixture boundary changed');
 // Original suites deliberately exercise legacy command JSON without extensions.
 let tail=original.slice(original.indexOf(marker)).replaceAll('insert into ideas values(', 'insert into ideas(id,user_id,status,last_activity_at) values(');
 //139 fixtures author plans before their version-capture migration. Reproduce its
 // current-only backfill boundary without reapplying an already installed table.
 tail=tail.replace(/await db.exec\(await readFile\('supabase\/migrations\/139_business_reality_results.sql','utf8'\)\);/g,"await db.exec('delete from business_reality_check_versions v using business_reality_checks p where v.user_id=p.user_id and v.plan_id=p.id and v.revision<p.revision');");
 tail=tail.replace(/await db.exec\(await readFile\('supabase\/migrations\/(?:141_business_followup_checks|143_business_confirmation_history).sql','utf8'\)\);/g,'');
 await import('data:text/javascript;base64,'+Buffer.from(prefix+migrations+tail).toString('base64'));
 console.log(`151 compatibility: unchanged ${suite} assertions passed against all real119–151 migrations`);
}
