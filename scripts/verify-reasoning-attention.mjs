// Local isolated databases only; this script never connects to Supabase.
await import('../lib/domains/observations/reasoning/postgres.integration.mjs');
await import('../lib/domains/observations/attention/postgres.integration.mjs');
await import('../lib/domains/observations/reasoning-attention-postgres.integration.mjs');
