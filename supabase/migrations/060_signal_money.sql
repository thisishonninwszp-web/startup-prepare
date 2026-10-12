-- ============================================================================
-- 迁移 060：外部信号报告加第五节"谁在掏钱"
-- signal_briefs.kind 扩成五种：news / tools / voices / calendar / money。
-- money：融资、众筹达成、补助金公募、事业承继和 M&A —— 抱怨不花钱，掏钱才是真的。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar', 'money'));
exception when duplicate_object then null; end $$;
