-- 杀掉专长树，连同那套已经死掉的 0–100 技能分数。
--
-- 专长是第二套货币：点数由**等级**发放，而等级来自任务经验 ——
-- 也就是说，一个专长可以用不是证据的东西买到。
-- 技能树在做同一件事，而且每一格都必须写下"哪一次、用它做成了什么"。
-- 两套并存的结果是维护两份内容，还让人分不清「点亮」和「点上」。
--
-- 一起清掉的还有 self_skills / self_skill_ticks：
-- 那是打勾涨分的旧模型，改成点亮节点之后就再没有任何地方写它们了。
-- 留着一张没人写的表，下一个人会以为它还活着。
--
-- 证据没有丢：节点和它们的 proof 在 self_skill_nodes 里，那张表不动。

drop table if exists self_feats;
drop table if exists self_skill_ticks;
drop table if exists self_skills;
