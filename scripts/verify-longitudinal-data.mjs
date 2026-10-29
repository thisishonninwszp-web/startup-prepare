// Isolated local PostgreSQL tests; no production database or actual event ingestion.
await import('../lib/domains/observations/statistics/postgres.integration.mjs');
await import('../lib/domains/observations/product-events/postgres.integration.mjs');
await import('../lib/domains/observations/scheduling/postgres.integration.mjs');
await import('../lib/domains/observations/longitudinal-postgres.integration.mjs');
