-- 101：预测题的「从这几样想起」（经用户同意，2026-10-24）。
-- 光让他点几成、不给思路，等于纯猜：后台先把每道等他判断的题拆好 —— 由哪几个因素决定、每个怎么起作用（两个方向的条件句）、
-- 现在怎样（上网查，原文由代码核对）、去哪看；不写方向、不写可能性数字（先判题也照样摆）。
-- 和每日练习的拆解卡同一个形状（lib/domains/signals/breakdown-shared.ts 的 Breakdown）；没拆过是 null。

alter table forecast_questions add column if not exists breakdown jsonb;
