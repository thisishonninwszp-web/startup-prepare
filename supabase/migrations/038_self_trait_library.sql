-- 特性的来源标记。
--
-- 库里的 52 条（26 根光谱 × 两端）由代码扫描授予与褪色，定义在
-- lib/domains/self-model/trait-library.ts。这里只需要在 self_traits 上
-- 记住"这条是库里的哪一条"，扫描才能认出自己发过的东西。
--
-- 手写的特性仍然允许，但标 custom：没经过库定义审查的东西，
-- 不该和有明确授予条件的平起平坐（品级上限在 TS 里压一档）。

alter table self_traits
  add column if not exists source text not null default 'custom'
    check (source in ('library', 'custom')),
  add column if not exists library_key text;

create unique index if not exists idx_self_traits_library_uniq
  on self_traits (user_id, library_key)
  where library_key is not null and status = 'held';
