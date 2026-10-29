// Local, isolated PostgreSQL verification. No remote database access.
await import('../lib/domains/observations/feedback/postgres.integration.mjs');
await import('../lib/domains/observations/feedback/reconsideration-postgres.integration.mjs');
await import('../lib/domains/observations/feedback/task-adjustments-postgres.integration.mjs');
