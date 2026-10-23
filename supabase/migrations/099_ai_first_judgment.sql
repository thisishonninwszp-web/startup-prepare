-- 099：AI 先判、他点行不行（经用户明确裁决，2026-10-23）。
-- forecasts.mode（只有 source = 'me' 的行有）：blind 先判（看不到 AI）、agree 点了「行」、override 改了一档。
-- signal_judgments.mode 同义；ai_draft 是那道练习题 AI 先判的原样（三种思路和中间值），改判时挑刺要看。
-- mode 为空 = 迁移以前记的，一律当先判（那时看不到 AI）。先判题不加列：代码按「东京时间每周最早进账本的那道」认。

alter table forecasts add column if not exists mode text;
do $$ begin
  alter table forecasts add constraint forecasts_mode_check check (mode in ('blind', 'agree', 'override'));
exception when duplicate_object then null; end $$;

alter table signal_judgments add column if not exists mode text;
do $$ begin
  alter table signal_judgments add constraint signal_judgments_mode_check check (mode in ('blind', 'agree', 'override'));
exception when duplicate_object then null; end $$;

alter table signal_judgments add column if not exists ai_draft jsonb;
