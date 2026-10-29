// Local isolated PostgreSQL only; no business API or production database calls.
await import('../lib/domains/business-teardowns/postgres.integration.mjs');
await import('../lib/domains/business-teardowns/report-postgres.integration.mjs');
await import('../lib/domains/business-teardowns/jobs/postgres.integration.mjs');
await import('../lib/domains/business-teardowns/learning-postgres.integration.mjs');
