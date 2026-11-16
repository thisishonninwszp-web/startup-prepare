-- 127：停掉没人点的那几样（经用户同意，2026-11-16）
--
-- 练习的 AI 先判、生意题、到日本题、假门先做好，两周里谁都没点过，就先不做新的（lib/domains/signals/pause-shared.ts）。
-- 「停了」不存，每次现算；这里只存他点「恢复」的时候：{"business": "2026-11-16T…Z", …}，从那时起再看两周。

alter table signal_prefs add column if not exists resumed jsonb not null default '{}'::jsonb;
