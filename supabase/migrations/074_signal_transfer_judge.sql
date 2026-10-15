-- ============================================================================
-- 迁移 074：时差图谱请裁判
-- 原文逐字核对只能保证"这句话确实在网页上"，不能保证它证明了那个说法
-- （"2014 年支付宝份额 82%"被拿来证明"2014 年推广线下扫码"）。每一条原文请 Jev 判它证明的是哪一样：
-- 那边的日子 / 日本的日子 / 在日本的结果 / 都证明不了。三样里有一样没有被证明的原文，这一件就"没过裁判"，
-- 不算进统计（不删，页面上写清是哪一样）。
-- judge_status：passed / failed / unavailable（裁判当时不可用，以后补判）；没判过为 null。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_transfer_cases add column if not exists judge_status text
  check (judge_status in ('passed', 'failed', 'unavailable'));
alter table signal_transfer_cases add column if not exists judge_note text;
