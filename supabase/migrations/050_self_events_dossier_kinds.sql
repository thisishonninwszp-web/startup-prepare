-- 档案的变化要在「最近的变化」里留下时间。
--
-- 其余所有东西都是「现在的状态」，只有 changelog 记得什么时候变的。
-- 档案里三种事值得记：一条苗头攒够次数长成了标签；同一件事第一次
-- 出现两边都有记录（分水岭）；一条主题的多数一侧换了边（翻过来了）。
--
-- 三种都是代码从证据算出来的派生事件，靠 dedupe_key 保证只记一次。

alter table self_events drop constraint if exists self_events_kind_check;
alter table self_events add constraint self_events_kind_check check (kind in (
  'trait_granted', 'trait_faded',
  'skill_up', 'skill_rust',
  'feat_taken',
  'title_earned', 'build_changed',
  'hypothesis_refuted', 'tier_changed',
  'label_formed', 'divide_found', 'label_flipped'
));
