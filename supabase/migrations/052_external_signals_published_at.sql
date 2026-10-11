-- ============================================================================
-- 迁移 052：外部信号复活（/signals 每日新闻）
-- external_signals 是 004 建的 staging 表，页面被杀后表一直没删。
-- 每日新闻要按"新闻本身的发布时间"排序，fetched_at 只是抓取时间，所以补一列。
-- 幂等，可重复执行。
-- ============================================================================

alter table external_signals add column if not exists published_at timestamptz;

create index if not exists idx_external_signals_published
  on external_signals (status, published_at desc nulls last);
