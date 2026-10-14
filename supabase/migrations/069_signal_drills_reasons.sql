-- ============================================================================
-- 迁移 069：历史题对理由
-- decided_by / decided_basis：实际是哪一两件事决定了结果 —— 只写资料里明确写到的原因，原文由代码核对；
--   资料没写原因就是空的（不让 AI 自己推因果）。
-- reason_match：揭晓后他自己标"我当时的理由对上了没有"。猜对了但理由没对上，其实是运气；
--   猜错了但理由对上了，判断没毛病、结果有变数。只数次数。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_drills add column if not exists decided_by text;
alter table signal_drills add column if not exists decided_basis jsonb;
alter table signal_drills add column if not exists reason_match boolean;
