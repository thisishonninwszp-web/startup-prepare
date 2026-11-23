import {readFile} from 'node:fs/promises';
// Run all original124 research scenarios after extending the actual SQL functions in148.
const source=await readFile('supabase/tests/business_research.integration.mjs','utf8');
const marker="const command = async (operation, input, user = owner) => {";
if(!source.includes(marker))throw new Error('Legacy research harness insertion point changed');
const setup=`await db.exec(\`create table business_withdrawal_sources(id uuid primary key,user_id uuid,issuer_id uuid,source_url text,captured_text text,captured_at timestamptz,published_on date,content_hash text,erased_at timestamptz);\`);
await db.exec(await readFile('supabase/migrations/148_business_withdrawal_research.sql','utf8'));
`;
const prepared=source.replace("new URL('../migrations/124_business_research_suite.sql', import.meta.url)","'supabase/migrations/124_business_research_suite.sql'").replace(marker,setup+marker);
await import('data:text/javascript;base64,'+Buffer.from(prepared).toString('base64'));
