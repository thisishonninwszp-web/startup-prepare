-- ============================================================================
-- 迁移 057：读新闻时 AI 知道的"你"改成从行为和处境事实里拼出来
-- 不再让用户手写"关于你"（那本身是一段自述）。signal_profiles 改为缓存：
--   facts：从 /self 自述里抽出的"处境事实"（工作、行业、在学、在做的事），
--          每条带原文出处，代码核对过出处确实在原文里；自我评价一律不抽。
--   facts_from：这份事实是根据哪个时间点之前的自述抽的，有新自述就重抽。
-- 经用户裁决（2026-10）：处境事实只用于判断新闻跟他有没有关系，不进 self 台账推理。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_profiles add column if not exists facts jsonb;          -- [{ fact, quote }]
alter table signal_profiles add column if not exists facts_from timestamptz;
