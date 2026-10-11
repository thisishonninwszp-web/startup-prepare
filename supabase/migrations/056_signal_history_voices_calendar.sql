-- ============================================================================
-- 迁移 056：外部信号 —— 历史上类似的事 + 现场 + 已经定了的未来
-- external_signals.history：一条新闻的"历史参照"（AI 找的相似事件、这类事通常怎样、荐书），
--   第一次点开时生成并缓存，和 analysis 一样不重复花钱。
-- signal_briefs.kind 扩成四种：news（世界）/ tools（新工具）/ voices（现场）/ calendar（日程）。
-- 幂等，可重复执行。
-- ============================================================================

alter table external_signals add column if not exists history jsonb;

alter table signal_briefs drop constraint if exists signal_briefs_kind_check;
do $$ begin
  alter table signal_briefs add constraint signal_briefs_kind_check
    check (kind in ('news', 'tools', 'voices', 'calendar'));
exception when duplicate_object then null; end $$;
