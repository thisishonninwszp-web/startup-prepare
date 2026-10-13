-- ============================================================================
-- 迁移 064：到期对账先上网查证据
-- signal_judgments.outcome_evidence：判断到期时上网查到的"现在实际怎样"
--   （{ checked_at, evidence: [{ url, title, fact, excerpt, stance }] }，原文由代码逐字核对过）。
--   对账以前先摆出来，免得自己给自己判卷时手松（后见之明：回头看总觉得"我早就知道"）。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_judgments add column if not exists outcome_evidence jsonb;
