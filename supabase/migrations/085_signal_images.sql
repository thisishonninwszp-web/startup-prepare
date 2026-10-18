-- ============================================================================
-- 迁移 085：外部信号的 AI 示意图
-- signal_images：差距清单里一条（一条讲透页、周刊挑条时）点「出一张配图」出的图，一张一行；同一条可以重出，旧的留着。
--   图本身存在 Storage 的 signal-images bucket（不公开，页面用服务器签的临时链接显示）。
--   图下面固定标「AI 生成的示意图」；模型不一定全听"不要文字"，他看过才拿去用。
-- 幂等，可重复执行。
-- ============================================================================

create table if not exists signal_images (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  side          text not null check (side in ('japan', 'us', 'china')),
  signal_id     uuid not null,
  storage_path  text not null,
  prompt        text not null,
  model         text not null,
  created_at    timestamptz not null default now()
);

create index if not exists signal_images_lookup on signal_images (user_id, side, signal_id, created_at desc);

alter table signal_images enable row level security;

drop policy if exists "signal_images_owner" on signal_images;
create policy "signal_images_owner" on signal_images
  for all using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signal-images', 'signal-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
