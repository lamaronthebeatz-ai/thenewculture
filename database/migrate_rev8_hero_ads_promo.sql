-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 8: Hero Manager + Advertisement Manager
-- + Promotion Manager (CMS V2 Phase 3 — Module 2, Module 3, Module 4, theo
-- đúng Architecture Report đã duyệt. Không mở rộng, không redesign.)
--
-- Phạm vi:
--   - hero_slots: thay dần khối GIF hero (content/settings/site.yml:
--     hero_gif/hero_gif_song_title/hero_gif_song_artist). Hero bài viết
--     (articles.featured/hero_priority, render_hero_slideshow()) KHÔNG đụng
--     tới — đã đúng CMS từ trước.
--   - ad_placements/ads: thay 2 slot quảng cáo tĩnh (ad_left_*/ad_right_*
--     trong site.yml). Seed đúng 12 loại quảng cáo user đã đặt tên
--     (Leaderboard...House Ads) LÀM DANH MỤC lựa chọn trong Dashboard, cộng
--     thêm 2 giá trị bắt buộc phải có để giữ đúng vị trí quảng cáo THẬT sự
--     đang chạy hôm nay (sidebar_left/sidebar_right — build.py hiện có
--     đúng 2 vị trí trái/phải, không phải 1 trong 12 loại trên) — không
--     đây không phải thêm tính năng, chỉ là mã định danh cho 2 vị trí đã
--     tồn tại từ trước để ánh xạ đúng dữ liệu cũ.
--   - promotions: thay content/campaigns/*.md. pick_active_campaign()
--     trong build.py (logic chọn 1-trong-nhiều theo ngày/priority) giữ
--     nguyên 100%, chỉ đổi nguồn dữ liệu đầu vào.
--
-- Xoá: Soft Delete toàn bộ (deleted_at), đúng quy ước thống nhất từ Phase 2.
-- File này KHÔNG sửa database/schema.sql, đúng quy ước từ Rev 5.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. hero_slots — Module 2
-- ----------------------------------------------------------------------------
create table if not exists public.hero_slots (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('image', 'gif', 'video', 'article_carousel')),
  title             text,
  subtitle          text,
  desktop_media_id  uuid references public.media (id) on delete set null,
  mobile_media_id   uuid references public.media (id) on delete set null,
  overlay_color     text,
  overlay_opacity   numeric check (overlay_opacity is null or (overlay_opacity between 0 and 1)),
  gradient_css      text,
  cta_label         text,
  cta_url           text,
  animation         text not null default 'none' check (animation in ('none', 'fade', 'ken-burns', 'slide')),
  priority          integer not null default 0,
  start_at          timestamptz,
  end_at            timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists hero_slots_active_idx
  on public.hero_slots (is_active, priority) where deleted_at is null;

drop trigger if exists trg_hero_slots_updated_at on public.hero_slots;
create trigger trg_hero_slots_updated_at
  before update on public.hero_slots
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. ad_placements — danh mục vị trí quảng cáo (Module 3)
-- ----------------------------------------------------------------------------
create table if not exists public.ad_placements (
  id     text primary key,
  label  text not null
);

insert into public.ad_placements (id, label) values
  ('leaderboard',      'Leaderboard'),
  ('billboard',        'Billboard'),
  ('sidebar',          'Sidebar'),
  ('rectangle',        'Rectangle'),
  ('sticky_banner',    'Sticky Banner'),
  ('footer_banner',    'Footer Banner'),
  ('popup',            'Popup'),
  ('floating_banner',  'Floating Banner'),
  ('interstitial',     'Interstitial'),
  ('native',           'Native Ads'),
  ('sponsored_block',  'Sponsored Block'),
  ('house_ad',         'House Ads'),
  -- 2 vị trí THẬT đang chạy trên site hôm nay (2 khối quảng cáo trái/phải
  -- hiện có ở scripts/build.py: render_sticky_ads_sidebar() /
  -- render_inline_ad_mobile() / render_homepage_ad_block()) — cần có ID
  -- riêng để build.py biết lấy đúng quảng cáo nào cho đúng vị trí nào.
  ('sidebar_left',     'Sidebar trái (vị trí hiện có)'),
  ('sidebar_right',    'Sidebar phải (vị trí hiện có)')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. ads — Module 3
-- ----------------------------------------------------------------------------
create table if not exists public.ads (
  id                uuid primary key default gen_random_uuid(),
  placement_id      text not null references public.ad_placements (id),
  campaign_name     text not null,
  creative_kind     text not null default 'image'
                    check (creative_kind in ('image', 'gif', 'video', 'html', 'native')),
  media_id          uuid references public.media (id) on delete set null,
  html_snippet      text,
  link_url          text,
  link_target       text not null default 'external' check (link_target in ('external', 'internal')),
  weight            integer not null default 1 check (weight > 0),
  priority          integer not null default 0,
  start_at          timestamptz,
  end_at            timestamptz,
  is_active         boolean not null default true,
  click_count       integer not null default 0,
  impression_count  integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists ads_placement_active_idx
  on public.ads (placement_id, is_active) where deleted_at is null;

drop trigger if exists trg_ads_updated_at on public.ads;
create trigger trg_ads_updated_at
  before update on public.ads
  for each row execute function public.set_updated_at();

-- Click/Impression tracking: RPC riêng thay vì mở UPDATE cho vai trò anon
-- (mở UPDATE trực tiếp sẽ cho phép ai đó sửa MỌI cột của ads, không chỉ 2
-- cột đếm). SECURITY DEFINER + chỉ tăng đúng 1 trong 2 cột theo p_kind.
create or replace function public.increment_ad_stat(p_ad_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'click' then
    update public.ads set click_count = click_count + 1 where id = p_ad_id;
  elsif p_kind = 'impression' then
    update public.ads set impression_count = impression_count + 1 where id = p_ad_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. promotions — Module 4 (thay content/campaigns/*.md)
-- ----------------------------------------------------------------------------
create table if not exists public.promotions (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  kind              text not null default 'campaign' check (kind in
                    ('album_release', 'event', 'workshop', 'community', 'newsletter',
                     'membership', 'announcement', 'promotion', 'campaign')),
  title             text not null,
  placement         text not null default 'sticky_bottom',
  media_id          uuid references public.media (id) on delete set null,
  mobile_media_id   uuid references public.media (id) on delete set null,
  video_url         text,
  destination_url   text,
  open_in_new_tab   boolean not null default true,
  dismissible       boolean not null default true,
  dismiss_days      integer not null default 0,
  priority          integer not null default 0,
  start_at          date,
  end_at            date,
  is_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create unique index if not exists promotions_slug_key on public.promotions (slug) where deleted_at is null;
create index if not exists promotions_active_idx
  on public.promotions (placement, is_active) where deleted_at is null;

drop trigger if exists trg_promotions_updated_at on public.promotions;
create trigger trg_promotions_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS — đúng mẫu is_active_editor() đã kiểm chứng ở Rev 5/6/7
-- ----------------------------------------------------------------------------
alter table public.hero_slots    enable row level security;
alter table public.ad_placements enable row level security;
alter table public.ads           enable row level security;
alter table public.promotions    enable row level security;

drop policy if exists "Public read hero slots" on public.hero_slots;
create policy "Public read hero slots" on public.hero_slots
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all hero slots" on public.hero_slots;
create policy "Editors can view all hero slots" on public.hero_slots
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert hero slots" on public.hero_slots;
create policy "Editors can insert hero slots" on public.hero_slots
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update hero slots" on public.hero_slots;
create policy "Editors can update hero slots" on public.hero_slots
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Public read ad placements" on public.ad_placements;
create policy "Public read ad placements" on public.ad_placements
  for select using (true);

drop policy if exists "Public read ads" on public.ads;
create policy "Public read ads" on public.ads
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all ads" on public.ads;
create policy "Editors can view all ads" on public.ads
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert ads" on public.ads;
create policy "Editors can insert ads" on public.ads
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update ads" on public.ads;
create policy "Editors can update ads" on public.ads
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Public read promotions" on public.promotions;
create policy "Public read promotions" on public.promotions
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all promotions" on public.promotions;
create policy "Editors can view all promotions" on public.promotions
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert promotions" on public.promotions;
create policy "Editors can insert promotions" on public.promotions
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update promotions" on public.promotions;
create policy "Editors can update promotions" on public.promotions
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ============================================================================
-- KHÔNG seed hero_slots/ads/promotions — đúng nguyên tắc đã áp dụng từ
-- Phase 1/2: bảng rỗng sau migration là đúng, build.py fallback về file-
-- based (site.yml hero_gif / site.yml ad_left,right / content/campaigns)
-- y hệt hiện tại cho tới khi editor chủ động nhập liệu qua Dashboard.
--
-- Xác nhận sau khi chạy (không bắt buộc):
--   select id, label from public.ad_placements order by id;
--   select policyname, cmd from pg_policies where schemaname='public'
--     and tablename in ('hero_slots','ad_placements','ads','promotions')
--     order by tablename, cmd;
-- ============================================================================
