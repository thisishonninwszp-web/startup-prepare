-- ============================================================================
-- 迁移 058：外部信号的"往下推"（多层推论）
-- external_signals.inference：一棵按需展开的推论树，存成扁平数组
--   [{ id, parent_id, depth, claim, why, watch, likelihood }]
--   likelihood 只有三档（likely / possible / unlikely），不存任何百分比（原则 1：精确性偏误）。
-- 每展开一个节点就追加几条，推过的不重复花钱。
-- 幂等，可重复执行。
-- ============================================================================

alter table external_signals add column if not exists inference jsonb;
