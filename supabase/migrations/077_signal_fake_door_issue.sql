-- ============================================================================
-- 迁移 077：周刊本身的假门（测"这份周刊能不能卖"）
-- signal_fake_doors 原来一页必须挂在差距清单的某一条上（signal_id + side）。
-- 现在多一种 kind='issue'：周刊付费版的那一页，不挂在任何一条上，中文、日文各最多一页。
--   中文页给想做日本市场的中国公司、做跨境的人；日文页给日本公司的新规事业担当。
--   有人留邮箱，就有了一个不用开发任何东西、下个月就能收钱的生意。
-- 幂等，可重复执行。
-- ============================================================================

alter table signal_fake_doors add column if not exists kind text not null default 'gap';

alter table signal_fake_doors drop constraint if exists signal_fake_doors_kind_check;
alter table signal_fake_doors add constraint signal_fake_doors_kind_check check (kind in ('gap', 'issue'));

alter table signal_fake_doors alter column signal_id drop not null;
alter table signal_fake_doors alter column side drop not null;

-- 差距的那种必须挂在一条上；周刊的那种不挂
alter table signal_fake_doors drop constraint if exists signal_fake_doors_shape;
alter table signal_fake_doors add constraint signal_fake_doors_shape check (
  (kind = 'gap' and signal_id is not null and side is not null)
  or (kind = 'issue' and signal_id is null and side is null)
);

create unique index if not exists signal_fake_doors_issue_uniq
  on signal_fake_doors (user_id, lang) where kind = 'issue';
