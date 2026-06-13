-- ============================================================================
-- 迁移 002：给 ideas 增加 tags 列（服务于想法库的标签筛选）
-- 标签在"提升"时从来源 observation 继承过来。
-- 在 Supabase SQL Editor 整段执行一次即可。幂等，可重复执行。
-- ============================================================================

alter table ideas
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_ideas_tags on ideas using gin (tags);
