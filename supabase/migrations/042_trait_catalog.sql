-- 特性目录：把特性库从代码搬进数据库。
--
-- 之前 80 条写在 lib/domains/self-model/trait-library.ts 里。要加到 300 条，
-- 那个文件会变成三千行，而且每加一批都得改代码、跑测试、发一次版。
--
-- 搬进表之后：判定逻辑仍然在代码里（纯函数、可测试、AI 碰不到），
-- 只是**规则从表里读**。之后加到 300、500 都只是灌数据。
--
-- 品级由条件难度自动定，不由人一条条指定：
--   1 个条件         普通 / 魔法
--   2 个条件         稀有
--   3 个条件         史诗
--   4 个条件或含极值  传说
-- 条件越多越难同时成立，所以稀有度就是"这几件事同时发生的概率"——
-- 这比拍脑袋分档诚实得多。

create table if not exists trait_catalog (
  key         text primary key,
  name        text not null,
  gloss       text not null,
  family      text not null
              check (family in ('dial', 'combo', 'absence', 'tempo', 'ratio')),
  -- 拨杆才有：它绑在哪根光谱上（互斥用）。组合类为 null。
  spectrum_key text,
  pole        text check (pole in ('negative', 'positive')),
  -- 条件全部为 AND：[{ "sub": "wil.closure", "op": "gte", "value": 15 }]
  conditions  jsonb not null,
  -- 挂到哪些子属性：[{ "sub": "...", "sign": "plus"|"minus", "note": "..." }]
  modifiers   jsonb not null default '[]'::jsonb,
  backfire    text,
  equip_note  text,
  set_key     text,
  -- 由条件难度算出来的品级，写在这里只是为了排序和展示；
  -- 真正的品级仍然由 traits.ts 从修正结构 + 证据强度结算。
  rarity_hint text not null default 'common',
  -- ⚠️ 集齐不是奖励，是提醒
  alarm       boolean not null default false,
  neutral     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_trait_catalog_family
  on trait_catalog (family, rarity_hint);

-- 目录是共享的定义，不是某个人的数据：任何登录用户都能读，但只有
-- service role 能写（灌数据走迁移，不走应用）。
alter table trait_catalog enable row level security;

drop policy if exists "trait_catalog_read" on trait_catalog;
create policy "trait_catalog_read" on trait_catalog
  for select using (auth.uid() is not null);

-- 第一批：从 lib/domains/self-model/trait-library.ts 导出的 80 条。
-- 生成方式见提交记录；之后新增直接往这张表灌，不用改代码。
insert into trait_catalog
  (key, name, gloss, family, spectrum_key, pole, conditions, modifiers,
   backfire, equip_note, set_key, rarity_hint, alarm, neutral)
values
  ('开工-', '湿柴', '总要先预热三小时', 'dial', '开工', 'negative', '[{"sub":"dex.ignition","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.ignition","sign":"minus","note":"点不着"}]'::jsonb, null, null, null, 'common', false, false),
  ('开工+', '火折子', '想到就动手', 'dial', '开工', 'positive', '[{"sub":"dex.ignition","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.ignition","sign":"plus","note":"一擦就着"},{"sub":"wis.contact","sign":"minus","note":"快到来不及先问一句"}]'::jsonb, '需求靠自己认定时，动手越快错得越远', '在需求已经明确的活上是纯资产', null, 'common', false, false),
  ('迭代-', '一炉定型', '指望一次成器', 'dial', '迭代', 'negative', '[{"sub":"dex.iteration","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.iteration","sign":"minus","note":"只出一版"}]'::jsonb, null, null, null, 'common', false, false),
  ('迭代+', '千锤手', '改到对为止', 'dial', '迭代', 'positive', '[{"sub":"dex.iteration","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.iteration","sign":"plus","note":"反复回炉"}]'::jsonb, null, null, null, 'common', false, false),
  ('战线-', '独锋', '一次只打一处', 'dial', '战线', 'negative', '[{"sub":"dex.parallel","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.parallel","sign":"minus","note":"同时只开一件"}]'::jsonb, null, null, null, 'common', false, true),
  ('战线+', '多头蛇', '同时开好几件', 'dial', '战线', 'positive', '[{"sub":"dex.parallel","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.parallel","sign":"plus","note":"并行度高"},{"sub":"wil.span","sign":"minus","note":"每件都熬不到底"}]'::jsonb, '并行数超过 3 时，每件的最长跨度都被砍短', '在探索期是资产，进交付期是负债', null, 'common', false, true),
  ('校准-', '摇骰子', '把握度全凭感觉', 'dial', '校准', 'negative', '[{"sub":"int.calibration","op":"lte","value":6}]'::jsonb, '[{"sub":"int.calibration","sign":"minus","note":"命中率低"}]'::jsonb, null, null, null, 'common', false, false),
  ('校准+', '测风者', '说八成就是八成', 'dial', '校准', 'positive', '[{"sub":"int.calibration","op":"gte","value":15}]'::jsonb, '[{"sub":"int.calibration","sign":"plus","note":"押得准"}]'::jsonb, null, null, null, 'common', false, false),
  ('复错-', '鬼打墙', '绕回同一个坑', 'dial', '复错', 'negative', '[{"sub":"int.repeat","op":"lte","value":6}]'::jsonb, '[{"sub":"int.repeat","sign":"minus","note":"学到了在重复"}]'::jsonb, null, null, null, 'common', false, false),
  ('复错+', '刻碑人', '学一次就刻死', 'dial', '复错', 'positive', '[{"sub":"int.repeat","op":"gte","value":15}]'::jsonb, '[{"sub":"int.repeat","sign":"plus","note":"不重复犯"}]'::jsonb, null, null, null, 'common', false, false),
  ('学用-', '藏经阁', '存了一屋子没翻过', 'dial', '学用', 'negative', '[{"sub":"int.transfer","op":"lte","value":6}]'::jsonb, '[{"sub":"int.transfer","sign":"minus","note":"学了不用"}]'::jsonb, null, null, null, 'common', false, false),
  ('学用+', '野路子', '边做边补', 'dial', '学用', 'positive', '[{"sub":"int.transfer","op":"gte","value":15}]'::jsonb, '[{"sub":"int.transfer","sign":"plus","note":"学完就用上"}]'::jsonb, null, null, null, 'common', false, false),
  ('接触-', '塔中人', '关在塔里做东西', 'dial', '接触', 'negative', '[{"sub":"wis.contact","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.contact","sign":"minus","note":"很少问真人"},{"sub":"dex.iteration","sign":"plus","note":"不等回复所以转得快"}]'::jsonb, '需求 100% 自我认定时，转得越快离得越远', '在需求已知的活上，独处产出确实更高', null, 'common', false, false),
  ('接触+', '游商', '到处问、到处换', 'dial', '接触', 'positive', '[{"sub":"wis.contact","op":"gte","value":15}]'::jsonb, '[{"sub":"wis.contact","sign":"plus","note":"接触密度高"}]'::jsonb, null, null, null, 'common', false, false),
  ('诚实-', '喜鹊', '只报喜', 'dial', '诚实', 'negative', '[{"sub":"wis.candor","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.candor","sign":"minus","note":"不利证据记得少"}]'::jsonb, null, null, null, 'common', false, false),
  ('诚实+', '验尸官', '敢看难看的那一面', 'dial', '诚实', 'positive', '[{"sub":"wis.candor","op":"gte","value":15}]'::jsonb, '[{"sub":"wis.candor","sign":"plus","note":"对己不利的照记"}]'::jsonb, null, null, null, 'common', false, false),
  ('纳谏-', '铁头盔', '听不进去', 'dial', '纳谏', 'negative', '[{"sub":"wis.persuadable","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.persuadable","sign":"minus","note":"被反驳也不改"},{"sub":"wil.restraint","sign":"plus","note":"不容易被带跑"}]'::jsonb, '反驳来自比你懂的人时，这顶头盔是纯亏', null, null, 'common', false, true),
  ('纳谏+', '风向旗', '谁说都听', 'dial', '纳谏', 'positive', '[{"sub":"wis.persuadable","op":"gte","value":15}]'::jsonb, '[{"sub":"wis.persuadable","sign":"plus","note":"改得快"},{"sub":"wil.restraint","sign":"minus","note":"容易被带着开新坑"}]'::jsonb, '没有自己的判断时，改得快只是被最后一个说话的人牵着走', null, null, 'common', false, true),
  ('收敛-', '半座桥', '起了头没收尾', 'dial', '收敛', 'negative', '[{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.closure","sign":"minus","note":"走到结论的少"},{"sub":"dex.iteration","sign":"plus","note":"不恋战，转得快"}]'::jsonb, '需要交付的环境里是纯负债', '在纯探索期，不恋战确实省时间', null, 'common', false, false),
  ('收敛+', '封顶匠', '起的头都封了顶', 'dial', '收敛', 'positive', '[{"sub":"wil.closure","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.closure","sign":"plus","note":"都走到 Go/Kill"}]'::jsonb, null, null, null, 'common', false, false),
  ('熬功-', '篝火客', '只坐一夜就走', 'dial', '熬功', 'negative', '[{"sub":"wil.span","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"minus","note":"跨度短"}]'::jsonb, null, null, null, 'common', false, false),
  ('熬功+', '掘井人', '下去就不上来', 'dial', '熬功', 'positive', '[{"sub":"wil.span","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"单主题投入极长"},{"sub":"lck.newcontext","sign":"minus","note":"一直待在同一口井里"}]'::jsonb, '井挖到一半发现没水时，沉没成本最难放手', '在方向已验证过的事上是纯资产', null, 'common', false, false),
  ('克制-', '捡石头', '见亮的就捡', 'dial', '克制', 'negative', '[{"sub":"wil.restraint","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.restraint","sign":"minus","note":"新坑开得勤"}]'::jsonb, null, null, null, 'common', false, false),
  ('克制+', '压舱石', '按得住手', 'dial', '克制', 'positive', '[{"sub":"wil.restraint","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.restraint","sign":"plus","note":"很少开新坑"}]'::jsonb, null, null, null, 'common', false, false),
  ('采纳-', '空谷回音', '喊完只有回声', 'dial', '采纳', 'negative', '[{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.adoption","sign":"minus","note":"提议少被接受"}]'::jsonb, null, null, null, 'common', false, false),
  ('采纳+', '铜锣手', '一敲全场都听见', 'dial', '采纳', 'positive', '[{"sub":"cha.adoption","op":"gte","value":15}]'::jsonb, '[{"sub":"cha.adoption","sign":"plus","note":"提议多被接受"}]'::jsonb, null, null, null, 'common', false, false),
  ('曝光-', '地窖', '做完了也不给人看', 'dial', '曝光', 'negative', '[{"sub":"cha.exposure","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.exposure","sign":"minus","note":"半成品不外露"}]'::jsonb, null, null, null, 'common', false, false),
  ('曝光+', '摆摊人', '没做完就摆出来', 'dial', '曝光', 'positive', '[{"sub":"cha.exposure","op":"gte","value":15}]'::jsonb, '[{"sub":"cha.exposure","sign":"plus","note":"早早给人看"}]'::jsonb, null, null, null, 'common', false, false),
  ('承诺-', '赊账', '总说回头再说', 'dial', '承诺', 'negative', '[{"sub":"cha.commitment","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.commitment","sign":"minus","note":"兑现率低"}]'::jsonb, null, null, null, 'common', false, false),
  ('承诺+', '押印', '说了就盖章', 'dial', '承诺', 'positive', '[{"sub":"cha.commitment","op":"gte","value":15}]'::jsonb, '[{"sub":"cha.commitment","sign":"plus","note":"承诺都兑现"}]'::jsonb, null, null, null, 'common', false, false),
  ('力量-', '木剑', '还在用练习剑', 'dial', '力量', 'negative', '[{"sub":"str.absolute","op":"lte","value":6}]'::jsonb, '[{"sub":"str.absolute","sign":"minus","note":"力量没长"}]'::jsonb, null, null, null, 'common', false, false),
  ('力量+', '扛石人', '一直在加片', 'dial', '力量', 'positive', '[{"sub":"str.absolute","op":"gte","value":15}]'::jsonb, '[{"sub":"str.absolute","sign":"plus","note":"力量在涨"}]'::jsonb, null, null, null, 'common', false, false),
  ('训练量-', '一炷香', '进去一会儿就走', 'dial', '训练量', 'negative', '[{"sub":"str.volume","op":"lte","value":6}]'::jsonb, '[{"sub":"str.volume","sign":"minus","note":"容量小"}]'::jsonb, null, null, null, 'common', false, false),
  ('训练量+', '铁砧', '扛得住量', 'dial', '训练量', 'positive', '[{"sub":"str.volume","op":"gte","value":15}]'::jsonb, '[{"sub":"str.volume","sign":"plus","note":"周吨位高"}]'::jsonb, null, null, null, 'common', false, false),
  ('有氧-', '一里路', '跑一里就喘', 'dial', '有氧', 'negative', '[{"sub":"con.aerobic","op":"lte","value":6}]'::jsonb, '[{"sub":"con.aerobic","sign":"minus","note":"有氧少"}]'::jsonb, null, null, null, 'common', false, false),
  ('有氧+', '驿马', '跑起来不停', 'dial', '有氧', 'positive', '[{"sub":"con.aerobic","op":"gte","value":15}]'::jsonb, '[{"sub":"con.aerobic","sign":"plus","note":"有氧足"}]'::jsonb, null, null, null, 'common', false, false),
  ('出勤-', '荒场', '练武场空着', 'dial', '出勤', 'negative', '[{"sub":"con.regular","op":"lte","value":6}]'::jsonb, '[{"sub":"con.regular","sign":"minus","note":"去得少"}]'::jsonb, null, null, null, 'common', false, false),
  ('出勤+', '日课僧', '风雨无阻', 'dial', '出勤', 'positive', '[{"sub":"con.regular","op":"gte","value":15}]'::jsonb, '[{"sub":"con.regular","sign":"plus","note":"出勤稳"}]'::jsonb, null, null, null, 'common', false, false),
  ('睡眠-', '夜枭', '睡够七小时的夜很少', 'dial', '睡眠', 'negative', '[{"sub":"con.sleep","op":"lte","value":6}]'::jsonb, '[{"sub":"con.sleep","sign":"minus","note":"睡眠债高"}]'::jsonb, null, null, null, 'common', false, false),
  ('睡眠+', '晨钟', '睡得够也睡得准', 'dial', '睡眠', 'positive', '[{"sub":"con.sleep","op":"gte","value":15}]'::jsonb, '[{"sub":"con.sleep","sign":"plus","note":"睡眠稳"}]'::jsonb, null, null, null, 'common', false, false),
  ('结识-', '常客', '永远同一张桌', 'dial', '结识', 'negative', '[{"sub":"lck.newfaces","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newfaces","sign":"minus","note":"新面孔少"}]'::jsonb, null, null, null, 'common', false, false),
  ('结识+', '串门', '见谁聊谁', 'dial', '结识', 'positive', '[{"sub":"lck.newfaces","op":"gte","value":15}]'::jsonb, '[{"sub":"lck.newfaces","sign":"plus","note":"新面孔多"}]'::jsonb, null, null, null, 'common', false, false),
  ('场子-', '旧地图', '只玩打熟的那几张图', 'dial', '场子', 'negative', '[{"sub":"lck.newcontext","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newcontext","sign":"minus","note":"情境少"}]'::jsonb, null, null, null, 'common', false, false),
  ('场子+', '探路人', '一直在开图', 'dial', '场子', 'positive', '[{"sub":"lck.newcontext","op":"gte","value":15}]'::jsonb, '[{"sub":"lck.newcontext","sign":"plus","note":"情境多"}]'::jsonb, null, null, null, 'common', false, false),
  ('意外-', '无风带', '什么都不会撞上来', 'dial', '意外', 'negative', '[{"sub":"lck.serendipity","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.serendipity","sign":"minus","note":"意外收获少"}]'::jsonb, null, null, null, 'common', false, false),
  ('意外+', '拾获者', '总能捡到东西', 'dial', '意外', 'positive', '[{"sub":"lck.serendipity","op":"gte","value":15}]'::jsonb, '[{"sub":"lck.serendipity","sign":"plus","note":"意外收获多"}]'::jsonb, null, null, null, 'common', false, false),
  ('余裕-', '空仓', '粮仓见底', 'dial', '余裕', 'negative', '[{"sub":"res.runway","op":"lte","value":6}]'::jsonb, '[{"sub":"res.runway","sign":"minus","note":"跑道短"}]'::jsonb, null, null, null, 'common', false, false),
  ('余裕+', '粮草官', '粮草充足', 'dial', '余裕', 'positive', '[{"sub":"res.runway","op":"gte","value":15}]'::jsonb, '[{"sub":"res.runway","sign":"plus","note":"跑道长"}]'::jsonb, null, null, null, 'common', false, false),
  ('援军-', '独狼', '没人可叫', 'dial', '援军', 'negative', '[{"sub":"res.allies","op":"lte","value":6}]'::jsonb, '[{"sub":"res.allies","sign":"minus","note":"可动员的人少"}]'::jsonb, null, null, null, 'common', false, false),
  ('援军+', '持号角', '吹了会有人来', 'dial', '援军', 'positive', '[{"sub":"res.allies","op":"gte","value":15}]'::jsonb, '[{"sub":"res.allies","sign":"plus","note":"可动员的人多"}]'::jsonb, null, null, null, 'common', false, false),
  ('时间-', '无自留地', '一周没几个钟头是自己的', 'dial', '时间', 'negative', '[{"sub":"res.time","op":"lte","value":6}]'::jsonb, '[{"sub":"res.time","sign":"minus","note":"可支配时间少"}]'::jsonb, null, null, null, 'common', false, false),
  ('时间+', '闲庭', '有整块属于自己的时间', 'dial', '时间', 'positive', '[{"sub":"res.time","op":"gte","value":15}]'::jsonb, '[{"sub":"res.time","sign":"plus","note":"可支配时间多"}]'::jsonb, null, null, null, 'common', false, false),
  ('识破-', '照单全收', '埋好的坑都踩了', 'dial', '识破', 'negative', '[{"sub":"int.decoy","op":"lte","value":6}]'::jsonb, '[{"sub":"int.decoy","sign":"minus","note":"识破率低"}]'::jsonb, null, null, null, 'common', false, false),
  ('识破+', '挑刺的眼', '一眼看出哪里不对', 'dial', '识破', 'positive', '[{"sub":"int.decoy","op":"gte","value":15}]'::jsonb, '[{"sub":"int.decoy","sign":"plus","note":"识破率高"}]'::jsonb, null, null, null, 'common', false, false),
  ('对账-', '翻篇', '事前写的条件事后不看', 'dial', '对账', 'negative', '[{"sub":"wil.precommit","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.precommit","sign":"minus","note":"很少回头对照"}]'::jsonb, null, null, null, 'common', false, false),
  ('对账+', '照单核对', '写下的条件逐条兑现', 'dial', '对账', 'positive', '[{"sub":"wil.precommit","op":"gte","value":15}]'::jsonb, '[{"sub":"wil.precommit","sign":"plus","note":"都回头对照过"}]'::jsonb, null, null, null, 'common', false, false),
  ('灰色-', '雾里的钟点', '一周有大段说不清去哪了', 'dial', '灰色', 'negative', '[{"sub":"res.gray","op":"lte","value":6}]'::jsonb, '[{"sub":"res.gray","sign":"minus","note":"灰色时间多"}]'::jsonb, null, null, null, 'common', false, false),
  ('灰色+', '账目清楚', '时间去哪了说得出来', 'dial', '灰色', 'positive', '[{"sub":"res.gray","op":"gte","value":15}]'::jsonb, '[{"sub":"res.gray","sign":"plus","note":"灰色时间少"}]'::jsonb, null, null, null, 'common', false, false),
  ('combo.cellar', '地窖酿酒师', '埋头酿得很深，没人尝过', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"wis.contact","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"深度"},{"sub":"cha.exposure","sign":"minus","note":"无人品尝"}]'::jsonb, '酿到一半发现没人喝时，最难放手', null, null, 'rare', false, false),
  ('combo.fivewells', '同时挖五口井', '每口都按 180 天的方式挖', 'combo', null, null, '[{"sub":"dex.parallel","op":"gte","value":15},{"sub":"wil.span","op":"gte","value":15}]'::jsonb, '[{"sub":"dex.parallel","sign":"plus","note":"并行"},{"sub":"wil.closure","sign":"minus","note":"全是半成品"}]'::jsonb, '并行数超过 3 时，每口井都挖不到水', null, null, 'rare', true, false),
  ('combo.lightnocook', '起灶不掌勺', '点火极快，收尾没有', 'combo', null, null, '[{"sub":"dex.ignition","op":"gte","value":15},{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.ignition","sign":"plus","note":"起手快"},{"sub":"wil.closure","sign":"minus","note":"收不了尾"}]'::jsonb, '需要交付的环境里，点得越快亏得越多', null, null, 'rare', true, false),
  ('combo.clearvoiceless', '看得清喊不动', '判断准，推不动人', 'combo', null, null, '[{"sub":"wis.candor","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.candor","sign":"plus","note":"看得清"},{"sub":"cha.adoption","sign":"minus","note":"没人动"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.loudwrong', '嗓门大过准头', '说服力强，但估不准 —— 最危险的一种', 'combo', null, null, '[{"sub":"cha.adoption","op":"gte","value":15},{"sub":"int.calibration","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.adoption","sign":"plus","note":"推得动"},{"sub":"int.calibration","sign":"minus","note":"押不准"}]'::jsonb, '别人照你说的做了，而你算错了', null, null, 'rare', true, false),
  ('combo.millstone', '空转的磨盘', '一直在转，没磨出面', 'combo', null, null, '[{"sub":"dex.iteration","op":"gte","value":15},{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.iteration","sign":"plus","note":"转得快"},{"sub":"wil.closure","sign":"minus","note":"没出成品"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.emptygranary', '守着空粮仓', '很能忍，但仓里没粮', 'combo', null, null, '[{"sub":"wil.restraint","op":"gte","value":15},{"sub":"res.runway","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.restraint","sign":"plus","note":"按得住"},{"sub":"res.runway","sign":"minus","note":"跑道短"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.onearmed', '独臂铁匠', '全靠自己一双手', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"res.allies","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"自己扛"},{"sub":"res.allies","sign":"minus","note":"没人可叫"}]'::jsonb, '一病就全停', null, null, 'rare', false, false),
  ('combo.nightlamp', '夜里的灯', '进度是熬出来的', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"con.sleep","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"熬得住"},{"sub":"con.sleep","sign":"minus","note":"睡眠债"}]'::jsonb, '债总要还，而且是连本带利', null, null, 'rare', true, false),
  ('combo.allplans', '满手计划', '开得多，结的少', 'combo', null, null, '[{"sub":"dex.parallel","op":"gte","value":15},{"sub":"wil.closure","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.parallel","sign":"plus","note":"并行"},{"sub":"wil.closure","sign":"minus","note":"收敛低"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.knocknodoor', '走遍全城不敲门', '认识很多人，没人替你办事', 'combo', null, null, '[{"sub":"lck.newfaces","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newfaces","sign":"plus","note":"面孔多"},{"sub":"cha.adoption","sign":"minus","note":"没人动"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.hoardnomarch', '屯粮不出兵', '粮草足，就是不发兵', 'combo', null, null, '[{"sub":"res.runway","op":"gte","value":15},{"sub":"dex.ignition","op":"lte","value":6}]'::jsonb, '[{"sub":"res.runway","sign":"plus","note":"余裕"},{"sub":"dex.ignition","sign":"minus","note":"不动手"}]'::jsonb, '跑道最长的时候不动，等短了更不敢动', null, null, 'rare', false, false),
  ('combo.seesnocount', '会看不会算', '敢看坏消息，但估不准', 'combo', null, null, '[{"sub":"wis.candor","op":"gte","value":15},{"sub":"int.calibration","op":"lte","value":6}]'::jsonb, '[{"sub":"wis.candor","sign":"plus","note":"敢看"},{"sub":"int.calibration","sign":"minus","note":"算不准"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.emptyhammer', '铁砧上的空锤', '练得很多，力气没长', 'combo', null, null, '[{"sub":"str.volume","op":"gte","value":15},{"sub":"str.absolute","op":"lte","value":6}]'::jsonb, '[{"sub":"str.volume","sign":"plus","note":"量够"},{"sub":"str.absolute","sign":"minus","note":"没进步"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.nomap', '跑得快没带地图', '动手极快，场子只有那几个', 'combo', null, null, '[{"sub":"dex.ignition","op":"gte","value":15},{"sub":"lck.newcontext","op":"lte","value":6}]'::jsonb, '[{"sub":"dex.ignition","sign":"plus","note":"起手快"},{"sub":"lck.newcontext","sign":"minus","note":"情境少"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.debtor', '债主的常客', '认识越多，欠得越多', 'combo', null, null, '[{"sub":"lck.newfaces","op":"gte","value":15},{"sub":"cha.commitment","op":"lte","value":6}]'::jsonb, '[{"sub":"lck.newfaces","sign":"plus","note":"面孔多"},{"sub":"cha.commitment","sign":"minus","note":"兑现低"}]'::jsonb, '圈子越大，欠账被看见得越快', null, null, 'rare', true, false),
  ('combo.wellbooks', '井底的藏书', '读了很多，用在同一口井里', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"int.transfer","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"钻得深"},{"sub":"int.transfer","sign":"minus","note":"学了不用"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.unheardbell', '无人应答的钟', '一直在敲，没人来', 'combo', null, null, '[{"sub":"cha.exposure","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"cha.exposure","sign":"plus","note":"敢给人看"},{"sub":"cha.adoption","sign":"minus","note":"没人接"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.veteranmap', '熟地图上的老兵', '在同一张图上打了很久', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"lck.newcontext","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"耐得住"},{"sub":"lck.newcontext","sign":"minus","note":"没换过场子"}]'::jsonb, '这张图打完之后，没有第二张', null, null, 'rare', false, false),
  ('combo.scavenger', '拾荒者的仓库', '什么都捡，什么都不用', 'combo', null, null, '[{"sub":"wil.restraint","op":"lte","value":6},{"sub":"int.transfer","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.restraint","sign":"minus","note":"见亮就捡"},{"sub":"int.transfer","sign":"minus","note":"捡了不用"}]'::jsonb, null, null, null, 'rare', true, false),
  ('combo.rightunheard', '铁口无人听', '算得准，没人听', 'combo', null, null, '[{"sub":"int.calibration","op":"gte","value":15},{"sub":"cha.adoption","op":"lte","value":6}]'::jsonb, '[{"sub":"int.calibration","sign":"plus","note":"押得准"},{"sub":"cha.adoption","sign":"minus","note":"推不动"}]'::jsonb, null, null, null, 'rare', false, false),
  ('combo.deafsmith', '闭耳的铁匠', '手艺在长，反话进不来', 'combo', null, null, '[{"sub":"wil.span","op":"gte","value":15},{"sub":"wis.persuadable","op":"lte","value":6}]'::jsonb, '[{"sub":"wil.span","sign":"plus","note":"沉得住"},{"sub":"wis.persuadable","sign":"minus","note":"听不进"}]'::jsonb, '方向错的时候，越沉得住亏得越大', null, null, 'rare', true, false)
on conflict (key) do update set
  name = excluded.name,
  gloss = excluded.gloss,
  conditions = excluded.conditions,
  modifiers = excluded.modifiers,
  backfire = excluded.backfire,
  rarity_hint = excluded.rarity_hint,
  alarm = excluded.alarm;
