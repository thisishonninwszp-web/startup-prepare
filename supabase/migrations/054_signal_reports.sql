-- ============================================================================
-- 迁移 054：外部信号的每日报告 + 单条详情
-- signal_briefs.overview：报告开头"今天的世界"那一段。
-- external_signals.analysis：详情页的 AI 深读，第一次打开时生成、存下，之后直接读，不重复花钱。
-- external_signals.excerpt：详情页显示的原文开头（新闻正文 / 仓库 README），和深读一起存。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_briefs add column if not exists overview text;

alter table external_signals add column if not exists analysis jsonb;
alter table external_signals add column if not exists excerpt text;
alter table external_signals add column if not exists analyzed_at timestamptz;
