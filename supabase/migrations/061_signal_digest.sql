-- ============================================================================
-- 迁移 061：每日报告加"今日总览"
-- signal_briefs.kind 加 digest：看完五节后，像一个懂行的人跟他讲几句今天世界上发生了什么，
--   再挑最值得点开的几条。overview 存总览正文，items 存挑出来的几条 { signal_id, headline, why }。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest'));
exception when duplicate_object then null; end $$;
