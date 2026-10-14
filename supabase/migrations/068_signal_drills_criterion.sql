-- ============================================================================
-- 迁移 068：历史题出得更公平
-- as_of：题面里"现在"是哪年哪月（问题的期限在它之后 2 到 24 个月）。
-- criterion：怎么才算"会"，一句具体的标准，显示在问题下面 —— 标准说不清，代码判对错就不公平。
-- flag：他觉得这题出得不好、跳过了（原因：mismatch 题面和问题不是一回事 / vague 标准说不清 /
--   famous 答案太有名 / other）。跳过的不算进次数，攒着拿来调出题。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_drills add column if not exists as_of text;
alter table signal_drills add column if not exists criterion text;
alter table signal_drills add column if not exists flag text;
