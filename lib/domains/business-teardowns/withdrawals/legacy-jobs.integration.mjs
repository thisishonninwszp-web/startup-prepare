import {readFile} from 'node:fs/promises';
// Execute the original job regression suite unchanged, after the new migration.
const source=await readFile('lib/domains/business-teardowns/jobs/postgres.integration.mjs','utf8');
const marker="const a='10000000-0000-4000-8000-000000000001'";
if(!source.includes(marker))throw new Error('Legacy job harness insertion point changed');
const additions="for(const name of ['135_business_operating_simulation','146_business_withdrawal_lessons'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));\n";
await import('data:text/javascript;base64,'+Buffer.from(source.replace(marker,additions+marker)).toString('base64'));
