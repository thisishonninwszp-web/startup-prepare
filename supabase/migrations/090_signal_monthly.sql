-- 090：月报（signal_briefs.kind = monthly，brief_date 是那个月的一号；items 是几条线（数组，和周报一样），
--      meta 存连起来的是哪几周 { weeks: ["2026-10-05", …] }）
alter table signal_briefs add column if not exists meta jsonb;
alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money', 'digest', 'weekly', 'gaps', 'monthly'));
exception when duplicate_object then null; end $$;
