-- 093：外部信号重构第三步 ——「今天」一页（经用户同意，2026-10-22）
--
-- 1. 限定时间段的按意思找改成「先按时间筛、再逐条算」。原来的写法让 hnsw 索引先取最相近的几十条、再筛时间，
--    时间段一窄（比如「这条之后的」「今天抓到的」）就几乎什么都剩不下 —— 存档越大越明显。
--    时间段里不超过两万条就逐条算（几百毫秒以内），更宽的照旧走索引（宽了筛完还剩得多）。
-- 2. story_updates：他在跟的那几条（标过的、记成观察的、写过判断的），之后抓到的、意思够近的消息。
--    「今天」一页和早上的邮件用它列「你在跟的事，有新消息」。

create index if not exists external_signals_fetched_idx on external_signals (fetched_at desc);

create or replace function match_external_signals(
  query_embedding extensions.vector(768),
  match_count int default 20,
  after timestamptz default null,
  before timestamptz default null
)
returns table (id uuid, source text, url text, title text, snippet text, fetched_at timestamptz, similarity float)
language plpgsql stable
set search_path = public, extensions
as $$
declare
  n bigint;
begin
  if after is not null or before is not null then
    select count(*) into n from external_signals s
    where (after is null or s.fetched_at >= after) and (before is null or s.fetched_at < before);
  end if;
  if n is not null and n <= 20000 then
    return query
      with w as materialized (
        select s.id, s.source, s.url, s.title, s.raw_text, s.fetched_at, s.embedding
        from external_signals s
        where s.embedding is not null
          and (after is null or s.fetched_at >= after)
          and (before is null or s.fetched_at < before)
      )
      select w.id, w.source, w.url, w.title, left(w.raw_text, 400), w.fetched_at, (1 - (w.embedding <=> query_embedding))::float
      from w
      order by w.embedding <=> query_embedding
      limit match_count;
  else
    return query
      select s.id, s.source, s.url, s.title, left(s.raw_text, 400), s.fetched_at, (1 - (s.embedding <=> query_embedding))::float
      from external_signals s
      where s.embedding is not null
        and (after is null or s.fetched_at >= after)
        and (before is null or s.fetched_at < before)
      order by s.embedding <=> query_embedding
      limit match_count;
  end if;
end;
$$;

-- 他在跟的那几条（followed）各自之后（since 以后抓到、也晚于那一条）意思够近的消息，每条最多 per_story 个，最像的在前。
create or replace function story_updates(
  followed uuid[],
  since timestamptz,
  min_similarity float default 0.72,
  per_story int default 3
)
returns table (followed_id uuid, id uuid, source text, url text, title text, fetched_at timestamptz, similarity float)
language sql stable
set search_path = public, extensions
as $$
  with f as materialized (
    select e.id, e.fetched_at, e.embedding
    from external_signals e
    where e.id = any (followed) and e.embedding is not null
  ),
  w as materialized (
    select s.id, s.source, s.url, s.title, s.fetched_at, s.embedding
    from external_signals s
    where s.embedding is not null and s.fetched_at >= since
  ),
  pairs as (
    select f.id as followed_id, w.id, w.source, w.url, w.title, w.fetched_at,
           (1 - (w.embedding <=> f.embedding))::float as similarity
    from f join w on w.id <> f.id and w.fetched_at > f.fetched_at
  ),
  ranked as (
    select p.*, row_number() over (partition by p.followed_id order by p.similarity desc) as rn
    from pairs p
    where p.similarity >= min_similarity
  )
  select r.followed_id, r.id, r.source, r.url, r.title, r.fetched_at, r.similarity
  from ranked r
  where r.rn <= per_story
  order by r.similarity desc;
$$;
